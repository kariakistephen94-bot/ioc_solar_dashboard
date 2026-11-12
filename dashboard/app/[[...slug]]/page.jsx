import App from "../../components/App";

// Every dashboard page has its own address (/pipeline, /whatsapp, ...) so a refresh or a shared link opens the same page.
const TITLES = {
  "": "Overview", pipeline: "Pipeline", leads: "Leads", conversations: "Conversations", calendar: "Calendar",
  "follow-ups": "Follow-ups", whatsapp: "WhatsApp", "ai-agent": "AI agent", settings: "Settings", team: "Team",
};

// The browser tab shows the page name straight away, before the page's JavaScript loads.
export async function generateMetadata({ params }) {
  const { slug = [] } = await params;
  return { title: `${TITLES[String(slug[0] || "").toLowerCase()] || "Overview"} · OIC Solar` };
}

export default async function Page({ params }) {
  const { slug = [] } = await params;
  return <App initialPath={slug[0] || ""} />;
}
