import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { App } from "./app/App.tsx"
import { createBackend } from "./backend"
import { ThemeProvider } from "./components/theme/ThemeProvider.tsx"
import { DataProvider } from "./providers/DataProvider.tsx"
import { JiraProvider } from "./providers/JiraProvider.tsx"
import { RequiredFieldsProvider } from "./providers/RequiredFieldsProvider.tsx"

/** The Jira Health server, or the in-browser demo (VITE_DATA_MODE). */
const backend = createBackend()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RequiredFieldsProvider>
        <JiraProvider gateway={backend.jira}>
          <DataProvider backend={backend}>
            <App />
          </DataProvider>
        </JiraProvider>
      </RequiredFieldsProvider>
    </ThemeProvider>
  </StrictMode>,
)
