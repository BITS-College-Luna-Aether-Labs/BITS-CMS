import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PublicLayout from "@/layouts/PublicLayout";
import NewsList from "@/pages/NewsList";
import NewsDetail from "@/pages/NewsDetail";
import NotFound from "@/pages/NotFound";
import { RequireAuth } from "@/auth/AuthContext";

const StudioLayout = lazy(() => import("@/layouts/StudioLayout"));
const Login = lazy(() => import("@/pages/studio/Login"));
const PostsList = lazy(() => import("@/pages/studio/PostsList"));
const PostEditor = lazy(() => import("@/pages/studio/PostEditor"));
const Admins = lazy(() => import("@/pages/studio/Admins"));
const Profile = lazy(() => import("@/pages/studio/Profile"));

function StudioFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-brand-muted">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<StudioFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Navigate to="/studio" replace />} />
          <Route path="news" element={<NewsList />} />
          <Route path="news/:slug" element={<NewsDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="studio">
          <Route path="login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <StudioLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/studio/posts" replace />} />
            <Route path="posts" element={<PostsList />} />
            <Route path="posts/new" element={<PostEditor />} />
            <Route path="posts/:id" element={<PostEditor />} />
            <Route
              path="admins"
              element={
                <RequireAuth role="superadmin">
                  <Admins />
                </RequireAuth>
              }
            />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
