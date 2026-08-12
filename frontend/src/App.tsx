import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { RecipeFormPage } from "./pages/RecipeFormPage";
import { RecipeImportPage } from "./pages/RecipeImportPage";
import { RecipeListPage } from "./pages/RecipeListPage";
import { SignupPage } from "./pages/SignupPage";
import { ToastProvider } from "./toast/ToastProvider";

/** Keys the edit form by recipe id so navigating from one recipe's edit page
 * straight to another's remounts rather than reusing the first one's state. */
function KeyedRecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  return <RecipeFormPage key={`edit-${id ?? ""}`} />;
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route path="/" element={<RecipeListPage />} />
                {/* The `key`s force a remount when moving between create and
                  * edit (and between two different recipes). Both routes
                  * render the same component at the same tree position, so
                  * without them React reconciles instead and the previous
                  * recipe's form state carries over into the next one. */}
                <Route path="/recipes/new" element={<RecipeFormPage key="new" />} />
                <Route path="/recipes/import" element={<RecipeImportPage />} />
                <Route path="/recipes/:id" element={<RecipeDetailPage />} />
                <Route path="/recipes/:id/edit" element={<KeyedRecipeFormPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
