import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { ImportProvider } from "./import/ImportProvider";
import { CollectionsPage } from "./pages/CollectionsPage";
import { LoginPage } from "./pages/LoginPage";
import { MealPlanPage } from "./pages/MealPlanPage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { RecipeFormPage } from "./pages/RecipeFormPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";
import { ToastProvider } from "./toast/ToastProvider";

/** Keys the edit form by recipe id so navigating from one recipe's edit page
 * straight to another's remounts rather than reusing the first one's state. */
function KeyedRecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  return <RecipeFormPage key={`edit-${id ?? ""}`} />;
}

/** `/recipes` was the old separate "All recipes" page; the library at `/`
 * replaced it. Redirects there keeping `?q`/`?tag`, so old links and
 * bookmarks still land on the same search. */
function LegacyRecipesRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/${search}`} replace />;
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* Needs router context (navigates on a completed import) — nested
            * here rather than outside BrowserRouter. */}
          <ImportProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<CollectionsPage />} />
                  <Route path="/collections/:id" element={<CollectionsPage />} />
                  <Route path="/meal-plan" element={<MealPlanPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/recipes" element={<LegacyRecipesRedirect />} />
                  {/* The `key`s force a remount when moving between create and
                    * edit (and between two different recipes). Both routes
                    * render the same component at the same tree position, so
                    * without them React reconciles instead and the previous
                    * recipe's form state carries over into the next one. */}
                  <Route path="/recipes/new" element={<RecipeFormPage key="new" />} />
                  <Route path="/recipes/:id" element={<RecipeDetailPage />} />
                  <Route path="/recipes/:id/edit" element={<KeyedRecipeFormPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ImportProvider>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
