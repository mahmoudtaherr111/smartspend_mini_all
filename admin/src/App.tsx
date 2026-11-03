import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { trpc } from "@/providers/trpc";
import { Shell } from "./shell/Shell";
import { SignIn } from "./pages/SignIn";
import { AiCalls } from "./pages/AiCalls";
import { Classifications } from "./pages/Classifications";
import { Connectors } from "./pages/Connectors";
import { Growth } from "./pages/Growth";
import { People } from "./pages/People";
import { Person } from "./pages/Person";
import { Today } from "./pages/Today";
import { Loading } from "./ui/states";

const LegacyConsole = lazy(() => import("./pages/LegacyConsole"));

/** Only staff reach the console: anyone else sees the sign-in page, and a signed-in user without the role is told so. */
export default function App() {
  const session = trpc.adminConsole.session.useQuery(undefined, { retry: false });

  if (session.isLoading) return <Loading full />;
  if (!session.data) {
    const code = session.error?.data?.code;
    return <SignIn forbidden={code === "FORBIDDEN"} />;
  }

  const isAdmin = session.data.role === "admin";
  return (
    <Shell name={session.data.name} isAdmin={isAdmin}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={isAdmin ? <Today /> : <Navigate to="/legacy" replace />} />
          {isAdmin && <Route path="/growth" element={<Growth />} />}
          {isAdmin && <Route path="/people" element={<People />} />}
          {isAdmin && <Route path="/people/:type/:id" element={<Person />} />}
          {isAdmin && <Route path="/ai/calls" element={<AiCalls />} />}
          {isAdmin && <Route path="/ai/classifications" element={<Classifications />} />}
          {isAdmin && <Route path="/ai/connectors" element={<Connectors />} />}
          <Route path="/legacy" element={<LegacyConsole />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
