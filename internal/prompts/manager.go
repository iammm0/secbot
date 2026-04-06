package prompts

type Manager struct {
	templates map[string]string
}

func NewManager() *Manager {
	return &Manager{
		templates: defaultTemplates,
	}
}

func (m *Manager) Get(name string) string {
	if t, ok := m.templates[name]; ok {
		return t
	}
	return ""
}

func (m *Manager) GetSystem(agentType string) string {
	switch agentType {
	case "secbot-cli", "hackbot":
		return m.Get("hackbot_security")
	case "superhackbot":
		return m.Get("superhackbot_security")
	case "planner":
		return m.Get("planner")
	case "summary":
		return m.Get("summary")
	case "qa":
		return m.Get("qa")
	default:
		return m.Get("hackbot_security")
	}
}

func (m *Manager) Set(name, template string) {
	m.templates[name] = template
}

func (m *Manager) List() []string {
	names := make([]string, 0, len(m.templates))
	for k := range m.templates {
		names = append(names, k)
	}
	return names
}
