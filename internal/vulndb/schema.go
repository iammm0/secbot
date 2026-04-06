package vulndb

import "time"

type VulnSeverity string

const (
	SeverityCritical VulnSeverity = "critical"
	SeverityHigh     VulnSeverity = "high"
	SeverityMedium   VulnSeverity = "medium"
	SeverityLow      VulnSeverity = "low"
	SeverityInfo     VulnSeverity = "info"
)

type VulnSource string

const (
	SourceCVE       VulnSource = "cve"
	SourceNVD       VulnSource = "nvd"
	SourceExploitDB VulnSource = "exploit-db"
	SourceMITRE     VulnSource = "mitre"
)

type AffectedProduct struct {
	Vendor  string `json:"vendor"`
	Product string `json:"product"`
	Version string `json:"version,omitempty"`
}

type ExploitRef struct {
	Source string `json:"source"`
	URL    string `json:"url"`
	ID     string `json:"id,omitempty"`
}

type MitreTechnique struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	TacticID    string `json:"tactic_id,omitempty"`
	TacticName  string `json:"tactic_name,omitempty"`
}

type Mitigation struct {
	Description string `json:"description"`
	URL         string `json:"url,omitempty"`
}

type UnifiedVuln struct {
	ID               string            `json:"id"`
	Source            VulnSource        `json:"source"`
	Severity         VulnSeverity      `json:"severity"`
	CVSSScore        float64           `json:"cvss_score"`
	Summary          string            `json:"summary"`
	Description      string            `json:"description"`
	AffectedProducts []AffectedProduct `json:"affected_products,omitempty"`
	Exploits         []ExploitRef      `json:"exploits,omitempty"`
	Techniques       []MitreTechnique  `json:"techniques,omitempty"`
	Mitigations      []Mitigation      `json:"mitigations,omitempty"`
	References       []string          `json:"references,omitempty"`
	PublishedDate    time.Time         `json:"published_date"`
	ModifiedDate     time.Time         `json:"modified_date"`
}
