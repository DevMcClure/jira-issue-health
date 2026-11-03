import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { App } from "./app/App.tsx"
import { ThemeProvider } from "./components/theme/ThemeProvider.tsx"
import { DataProvider } from "./providers/DataProvider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </ThemeProvider>
  </StrictMode>,
)
