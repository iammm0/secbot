package vulndb

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Service struct {
	client *http.Client
}

func NewService() *Service {
	return &Service{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *Service) LookupCVE(cveID string) (*UnifiedVuln, error) {
	cveID = strings.TrimSpace(strings.ToUpper(cveID))
	if !strings.HasPrefix(cveID, "CVE-") {
		return nil, fmt.Errorf("无效 CVE ID: %s", cveID)
	}

	apiURL := fmt.Sprintf("https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=%s", url.QueryEscape(cveID))
	resp, err := s.client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("NVD API 请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var nvdResp struct {
		Vulnerabilities []struct {
			CVE struct {
				ID          string `json:"id"`
				Description struct {
					Data []struct {
						Value string `json:"value"`
					} `json:"descriptions"`
				} `json:"descriptions"`
				Metrics struct {
					CVSS31 []struct {
						Data struct {
							BaseScore float64 `json:"baseScore"`
							Severity  string  `json:"baseSeverity"`
						} `json:"cvssData"`
					} `json:"cvssMetricV31"`
				} `json:"metrics"`
				Published string `json:"published"`
				Modified  string `json:"lastModified"`
			} `json:"cve"`
		} `json:"vulnerabilities"`
	}

	if err := json.Unmarshal(body, &nvdResp); err != nil {
		return nil, fmt.Errorf("解析 NVD 响应失败: %w", err)
	}

	if len(nvdResp.Vulnerabilities) == 0 {
		return nil, fmt.Errorf("未找到 %s", cveID)
	}

	cve := nvdResp.Vulnerabilities[0].CVE
	vuln := &UnifiedVuln{
		ID:     cve.ID,
		Source: SourceNVD,
	}

	if len(cve.Description.Data) > 0 {
		vuln.Description = cve.Description.Data[0].Value
		vuln.Summary = cve.Description.Data[0].Value
		if len(vuln.Summary) > 200 {
			vuln.Summary = vuln.Summary[:200] + "..."
		}
	}

	if len(cve.Metrics.CVSS31) > 0 {
		vuln.CVSSScore = cve.Metrics.CVSS31[0].Data.BaseScore
		vuln.Severity = parseSeverity(cve.Metrics.CVSS31[0].Data.Severity)
	}

	vuln.PublishedDate, _ = time.Parse(time.RFC3339, cve.Published)
	vuln.ModifiedDate, _ = time.Parse(time.RFC3339, cve.Modified)

	return vuln, nil
}

func (s *Service) SearchByKeyword(keyword string, limit int) ([]UnifiedVuln, error) {
	if limit <= 0 {
		limit = 10
	}
	apiURL := fmt.Sprintf("https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=%s&resultsPerPage=%d",
		url.QueryEscape(keyword), limit)

	resp, err := s.client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var nvdResp struct {
		Vulnerabilities []struct {
			CVE struct {
				ID          string `json:"id"`
				Description struct {
					Data []struct {
						Value string `json:"value"`
					} `json:"descriptions"`
				} `json:"descriptions"`
			} `json:"cve"`
		} `json:"vulnerabilities"`
	}

	if err := json.Unmarshal(body, &nvdResp); err != nil {
		return nil, err
	}

	var results []UnifiedVuln
	for _, v := range nvdResp.Vulnerabilities {
		vuln := UnifiedVuln{
			ID:     v.CVE.ID,
			Source: SourceNVD,
		}
		if len(v.CVE.Description.Data) > 0 {
			vuln.Summary = v.CVE.Description.Data[0].Value
			if len(vuln.Summary) > 200 {
				vuln.Summary = vuln.Summary[:200] + "..."
			}
		}
		results = append(results, vuln)
	}
	return results, nil
}

func parseSeverity(s string) VulnSeverity {
	switch strings.ToLower(s) {
	case "critical":
		return SeverityCritical
	case "high":
		return SeverityHigh
	case "medium":
		return SeverityMedium
	case "low":
		return SeverityLow
	default:
		return SeverityInfo
	}
}
