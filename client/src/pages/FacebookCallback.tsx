import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Esta página é aberta como popup pelo fluxo de Facebook OAuth.
 * Ela lê o `code` da URL e envia via postMessage para a janela pai,
 * depois fecha o popup automaticamente.
 */
export default function FacebookCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      if (window.opener) {
        window.opener.postMessage({ type: "fb_oauth_error", error }, window.location.origin);
      }
      window.close();
      return;
    }

    if (code) {
      if (window.opener) {
        window.opener.postMessage({ type: "fb_oauth_code", code }, window.location.origin);
      }
      window.close();
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Processando autenticação Facebook...</p>
    </div>
  );
}
