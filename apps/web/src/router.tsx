import { createBrowserRouter } from "react-router";

import AppShell from "./app-shell";
import Dashboard from "./routes/dashboard";
import Home from "./routes/home";
import Login from "./routes/login";
import Processing from "./routes/processing";
import Submit from "./routes/submit";
import SuccessPage from "./routes/success";

function NotFound() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-semibold text-2xl">404</h1>
      <p className="text-muted-foreground">The requested page could not be found.</p>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "success", element: <SuccessPage /> },
      { path: "submit", element: <Submit /> },
      { path: "processing/:jobId", element: <Processing /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
