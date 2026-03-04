package resilience

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand"
	"time"

	"github.com/tmc/langchaingo/llms"
)

// ResilientLLM wraps an LLM with retry, fallback, timeout, and degradation capabilities.
type ResilientLLM struct {
	Primary     llms.Model    // Primary LLM
	Fallback    llms.Model    // Backup LLM (nil = no fallback)
	MaxRetries  int           // Max retry attempts for primary
	BaseDelay   time.Duration // Base delay for exponential backoff
	MaxDelay    time.Duration // Maximum backoff delay
	Timeout     time.Duration // Timeout per request
	DegradedMsg string        // Fixed response when all else fails (empty = return error)
	Verbose     bool
}

// NewResilientLLM creates a new resilient LLM wrapper with sensible defaults.
func NewResilientLLM(primary llms.Model, opts ...Option) *ResilientLLM {
	r := &ResilientLLM{
		Primary:    primary,
		MaxRetries: 3,
		BaseDelay:  500 * time.Millisecond,
		MaxDelay:   10 * time.Second,
		Timeout:    30 * time.Second,
	}
	for _, opt := range opts {
		opt(r)
	}
	return r
}

// Option configures the resilient LLM.
type Option func(*ResilientLLM)

// WithFallback sets a fallback LLM model.
func WithFallback(fallback llms.Model) Option {
	return func(r *ResilientLLM) { r.Fallback = fallback }
}

// WithMaxRetries sets the maximum retry count.
func WithMaxRetries(n int) Option {
	return func(r *ResilientLLM) { r.MaxRetries = n }
}

// WithBaseDelay sets the base delay for exponential backoff.
func WithBaseDelay(d time.Duration) Option {
	return func(r *ResilientLLM) { r.BaseDelay = d }
}

// WithTimeout sets the per-request timeout.
func WithTimeout(d time.Duration) Option {
	return func(r *ResilientLLM) { r.Timeout = d }
}

// WithDegradedMessage sets a fixed fallback message for total failure.
func WithDegradedMessage(msg string) Option {
	return func(r *ResilientLLM) { r.DegradedMsg = msg }
}

// WithVerboseResilience enables verbose logging.
func WithVerboseResilience(v bool) Option {
	return func(r *ResilientLLM) { r.Verbose = v }
}

// Generate sends a prompt with full resilience: retry -> fallback -> degrade.
func (r *ResilientLLM) Generate(ctx context.Context, prompt string, opts ...llms.CallOption) (string, error) {
	// Try primary with retries
	result, err := r.tryWithRetries(ctx, r.Primary, "primary", prompt, opts...)
	if err == nil {
		return result, nil
	}

	if r.Verbose {
		log.Printf("[Resilience] Primary failed after %d retries: %v", r.MaxRetries, err)
	}

	// Try fallback
	if r.Fallback != nil {
		if r.Verbose {
			log.Printf("[Resilience] Trying fallback model...")
		}
		result, err = r.tryWithRetries(ctx, r.Fallback, "fallback", prompt, opts...)
		if err == nil {
			return result, nil
		}
		if r.Verbose {
			log.Printf("[Resilience] Fallback also failed: %v", err)
		}
	}

	// Degraded mode
	if r.DegradedMsg != "" {
		if r.Verbose {
			log.Printf("[Resilience] Entering degraded mode")
		}
		return r.DegradedMsg, nil
	}

	return "", fmt.Errorf("all attempts failed: %w", err)
}

// GenerateContent wraps GenerateContent with resilience.
func (r *ResilientLLM) GenerateContent(ctx context.Context, messages []llms.MessageContent, opts ...llms.CallOption) (*llms.ContentResponse, error) {
	// Try primary with retries
	for attempt := 0; attempt <= r.MaxRetries; attempt++ {
		if attempt > 0 {
			delay := r.backoffDelay(attempt)
			if r.Verbose {
				log.Printf("[Resilience] Retry %d/%d for primary (waiting %v)", attempt, r.MaxRetries, delay)
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		reqCtx, cancel := context.WithTimeout(ctx, r.Timeout)
		resp, err := r.Primary.GenerateContent(reqCtx, messages, opts...)
		cancel()
		if err == nil {
			return resp, nil
		}
	}

	// Try fallback
	if r.Fallback != nil {
		reqCtx, cancel := context.WithTimeout(ctx, r.Timeout)
		resp, err := r.Fallback.GenerateContent(reqCtx, messages, opts...)
		cancel()
		if err == nil {
			return resp, nil
		}
	}

	return nil, fmt.Errorf("all GenerateContent attempts failed")
}

func (r *ResilientLLM) tryWithRetries(ctx context.Context, model llms.Model, name, prompt string, opts ...llms.CallOption) (string, error) {
	var lastErr error
	for attempt := 0; attempt <= r.MaxRetries; attempt++ {
		if attempt > 0 {
			delay := r.backoffDelay(attempt)
			if r.Verbose {
				log.Printf("[Resilience] Retry %d/%d for %s (waiting %v)", attempt, r.MaxRetries, name, delay)
			}
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(delay):
			}
		}

		reqCtx, cancel := context.WithTimeout(ctx, r.Timeout)
		result, err := llms.GenerateFromSinglePrompt(reqCtx, model, prompt, opts...)
		cancel()

		if err == nil {
			return result, nil
		}
		lastErr = err
	}
	return "", lastErr
}

func (r *ResilientLLM) backoffDelay(attempt int) time.Duration {
	// Exponential backoff with jitter
	delay := float64(r.BaseDelay) * math.Pow(2, float64(attempt-1))
	if delay > float64(r.MaxDelay) {
		delay = float64(r.MaxDelay)
	}
	// Add jitter (0-25%)
	jitter := delay * 0.25 * rand.Float64() //nolint:gosec
	return time.Duration(delay + jitter)
}
