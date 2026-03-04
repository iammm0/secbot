package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

func (l Level) String() string {
	switch l {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

func ParseLevel(s string) Level {
	switch strings.ToUpper(s) {
	case "DEBUG":
		return DEBUG
	case "WARN", "WARNING":
		return WARN
	case "ERROR":
		return ERROR
	default:
		return INFO
	}
}

type Logger struct {
	level  Level
	logger *log.Logger
	file   *os.File
}

var defaultLogger *Logger

func Init(level string, logFile string) error {
	l := &Logger{level: ParseLevel(level)}

	writers := []io.Writer{os.Stderr}

	if logFile != "" {
		dir := filepath.Dir(logFile)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("创建日志目录失败: %w", err)
		}
		f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			return fmt.Errorf("打开日志文件失败: %w", err)
		}
		l.file = f
		writers = append(writers, f)
	}

	l.logger = log.New(io.MultiWriter(writers...), "", 0)
	defaultLogger = l
	return nil
}

func Close() {
	if defaultLogger != nil && defaultLogger.file != nil {
		defaultLogger.file.Close()
	}
}

func output(level Level, format string, args ...any) {
	if defaultLogger == nil {
		return
	}
	if level < defaultLogger.level {
		return
	}
	ts := time.Now().Format("15:04:05")
	msg := fmt.Sprintf(format, args...)
	defaultLogger.logger.Printf("%s [%s] %s", ts, level, msg)
}

func Debugf(format string, args ...any) { output(DEBUG, format, args...) }
func Infof(format string, args ...any)  { output(INFO, format, args...) }
func Warnf(format string, args ...any)  { output(WARN, format, args...) }
func Errorf(format string, args ...any) { output(ERROR, format, args...) }
