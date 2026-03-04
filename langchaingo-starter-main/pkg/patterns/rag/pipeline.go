package rag

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/schema"
)

// RAGPipeline implements a complete Retrieval-Augmented Generation pipeline
// with an in-memory vector store (no external dependencies).
type RAGPipeline struct {
	LLM       llms.Model
	Embedder  Embedder
	Store     *InMemoryVectorStore
	ChunkSize int
	TopK      int
}

// Embedder is a simple interface for text embedding.
// This can be implemented with any embedding provider.
type Embedder interface {
	EmbedText(ctx context.Context, text string) ([]float64, error)
	EmbedTexts(ctx context.Context, texts []string) ([][]float64, error)
}

// NewRAGPipeline creates a new RAG pipeline.
func NewRAGPipeline(llm llms.Model, embedder Embedder, chunkSize, topK int) *RAGPipeline {
	if chunkSize <= 0 {
		chunkSize = 500
	}
	if topK <= 0 {
		topK = 3
	}
	return &RAGPipeline{
		LLM:       llm,
		Embedder:  embedder,
		Store:     NewInMemoryVectorStore(),
		ChunkSize: chunkSize,
		TopK:      topK,
	}
}

// Ingest adds documents to the pipeline. Documents are chunked and embedded.
func (r *RAGPipeline) Ingest(ctx context.Context, docs []schema.Document) error {
	// Chunk documents
	chunks := r.chunkDocuments(docs)
	if len(chunks) == 0 {
		return fmt.Errorf("no content to ingest")
	}

	// Extract texts for embedding
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.PageContent
	}

	// Embed all chunks
	embeddings, err := r.Embedder.EmbedTexts(ctx, texts)
	if err != nil {
		return fmt.Errorf("embedding failed: %w", err)
	}

	// Store in vector store
	for i, chunk := range chunks {
		r.Store.Add(VectorEntry{
			ID:        fmt.Sprintf("doc_%d", r.Store.Size()+i),
			Content:   chunk.PageContent,
			Embedding: embeddings[i],
			Metadata:  chunk.Metadata,
		})
	}

	return nil
}

// IngestText is a convenience method for ingesting plain text.
func (r *RAGPipeline) IngestText(ctx context.Context, text string, metadata map[string]any) error {
	doc := schema.Document{
		PageContent: text,
		Metadata:    metadata,
	}
	return r.Ingest(ctx, []schema.Document{doc})
}

// Query retrieves relevant documents and generates an answer.
func (r *RAGPipeline) Query(ctx context.Context, question string) (string, error) {
	// Embed the question
	queryEmbed, err := r.Embedder.EmbedText(ctx, question)
	if err != nil {
		return "", fmt.Errorf("query embedding failed: %w", err)
	}

	// Retrieve top-K relevant chunks
	results := r.Store.Search(queryEmbed, r.TopK)
	if len(results) == 0 {
		return r.generateWithoutContext(ctx, question)
	}

	// Build context from retrieved documents
	var context strings.Builder
	for i, result := range results {
		fmt.Fprintf(&context, "[Document %d (score: %.2f)]:\n%s\n\n", i+1, result.Score, result.Content)
	}

	// Generate answer with retrieved context
	return r.generateWithContext(ctx, question, context.String())
}

// QueryWithSources retrieves and returns source documents along with the answer.
func (r *RAGPipeline) QueryWithSources(ctx context.Context, question string) (string, []SearchResult, error) {
	queryEmbed, err := r.Embedder.EmbedText(ctx, question)
	if err != nil {
		return "", nil, fmt.Errorf("query embedding failed: %w", err)
	}

	results := r.Store.Search(queryEmbed, r.TopK)

	var contextStr strings.Builder
	for i, result := range results {
		fmt.Fprintf(&contextStr, "[Document %d]:\n%s\n\n", i+1, result.Content)
	}

	answer, err := r.generateWithContext(ctx, question, contextStr.String())
	if err != nil {
		return "", nil, err
	}

	return answer, results, nil
}

func (r *RAGPipeline) generateWithContext(ctx context.Context, question, docContext string) (string, error) {
	prompt := fmt.Sprintf(`Answer the question based on the following context. If the context doesn't contain enough information, say so and provide what you can.

Context:
%s

Question: %s

Answer:`, docContext, question)

	resp, err := llms.GenerateFromSinglePrompt(ctx, r.LLM, prompt)
	if err != nil {
		return "", fmt.Errorf("generation failed: %w", err)
	}
	return resp, nil
}

func (r *RAGPipeline) generateWithoutContext(ctx context.Context, question string) (string, error) {
	prompt := fmt.Sprintf("I don't have specific documents to reference, but I'll answer based on general knowledge.\n\nQuestion: %s\n\nAnswer:", question)
	return llms.GenerateFromSinglePrompt(ctx, r.LLM, prompt)
}

func (r *RAGPipeline) chunkDocuments(docs []schema.Document) []schema.Document {
	var chunks []schema.Document
	for _, doc := range docs {
		text := doc.PageContent
		if len(text) <= r.ChunkSize {
			chunks = append(chunks, doc)
			continue
		}

		// Split by paragraphs first, then by sentences, then by size
		paragraphs := strings.Split(text, "\n\n")
		var currentChunk strings.Builder
		for _, para := range paragraphs {
			if currentChunk.Len()+len(para) > r.ChunkSize && currentChunk.Len() > 0 {
				chunks = append(chunks, schema.Document{
					PageContent: currentChunk.String(),
					Metadata:    doc.Metadata,
				})
				currentChunk.Reset()
			}
			if currentChunk.Len() > 0 {
				currentChunk.WriteString("\n\n")
			}
			currentChunk.WriteString(para)
		}
		if currentChunk.Len() > 0 {
			chunks = append(chunks, schema.Document{
				PageContent: currentChunk.String(),
				Metadata:    doc.Metadata,
			})
		}
	}
	return chunks
}

// --- In-Memory Vector Store ---

// VectorEntry stores a document with its embedding.
type VectorEntry struct {
	ID        string
	Content   string
	Embedding []float64
	Metadata  map[string]any
}

// SearchResult is a retrieved document with similarity score.
type SearchResult struct {
	Content  string         `json:"content"`
	Score    float64        `json:"score"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// InMemoryVectorStore is a simple in-memory vector store using cosine similarity.
type InMemoryVectorStore struct {
	entries []VectorEntry
}

// NewInMemoryVectorStore creates a new in-memory vector store.
func NewInMemoryVectorStore() *InMemoryVectorStore {
	return &InMemoryVectorStore{
		entries: make([]VectorEntry, 0),
	}
}

// Add adds an entry to the store.
func (s *InMemoryVectorStore) Add(entry VectorEntry) {
	s.entries = append(s.entries, entry)
}

// Size returns the number of entries.
func (s *InMemoryVectorStore) Size() int {
	return len(s.entries)
}

// Search finds the top-K most similar entries to the query embedding.
func (s *InMemoryVectorStore) Search(queryEmbed []float64, topK int) []SearchResult {
	type scored struct {
		index int
		score float64
	}
	var scores []scored
	for i, entry := range s.entries {
		score := cosineSimilarity(queryEmbed, entry.Embedding)
		scores = append(scores, scored{index: i, score: score})
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].score > scores[j].score
	})

	results := make([]SearchResult, 0, topK)
	for i := 0; i < topK && i < len(scores); i++ {
		entry := s.entries[scores[i].index]
		results = append(results, SearchResult{
			Content:  entry.Content,
			Score:    scores[i].score,
			Metadata: entry.Metadata,
		})
	}
	return results
}

func cosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

// --- Simple LLM-based Embedder (fallback when no dedicated embedding model) ---

// SimpleEmbedder uses character-level hashing for basic similarity.
// For production use, replace with OpenAI/Anthropic/Ollama embeddings.
type SimpleEmbedder struct {
	Dimensions int
}

// NewSimpleEmbedder creates a basic hash-based embedder (for demo purposes).
func NewSimpleEmbedder(dimensions int) *SimpleEmbedder {
	if dimensions <= 0 {
		dimensions = 128
	}
	return &SimpleEmbedder{Dimensions: dimensions}
}

func (e *SimpleEmbedder) EmbedText(_ context.Context, text string) ([]float64, error) {
	return hashEmbed(text, e.Dimensions), nil
}

func (e *SimpleEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float64, error) {
	results := make([][]float64, len(texts))
	for i, t := range texts {
		results[i] = hashEmbed(t, e.Dimensions)
	}
	return results, nil
}

// hashEmbed creates a simple deterministic embedding based on character n-grams.
// This is a basic fallback - use real embeddings for production.
func hashEmbed(text string, dims int) []float64 {
	vec := make([]float64, dims)
	text = strings.ToLower(text)
	words := strings.Fields(text)
	for _, word := range words {
		for i := 0; i < len(word); i++ {
			idx := int(word[i]) % dims
			vec[idx] += 1.0
		}
		// Bigrams
		for i := 0; i+1 < len(word); i++ {
			idx := (int(word[i])*31 + int(word[i+1])) % dims
			vec[idx] += 0.5
		}
	}
	// Normalize
	var norm float64
	for _, v := range vec {
		norm += v * v
	}
	if norm > 0 {
		norm = math.Sqrt(norm)
		for i := range vec {
			vec[i] /= norm
		}
	}
	return vec
}
