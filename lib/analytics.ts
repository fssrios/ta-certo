/**
 * Eventos customizados do Vercel Analytics.
 * Chame estas funções em client components — elas são no-ops fora da Vercel.
 */
import { track } from "@vercel/analytics";

/** Usuário concluiu uma auditoria (anônimo ou logado). */
export function trackAuditCompleted(params: {
  hasErrors: boolean;
  errorCount: number;
  /** true = usuário estava logado e o resultado foi salvo no banco */
  saved: boolean;
}) {
  track("audit_completed", params);
}

/** Usuário clicou em "Salvar resultado" (banner pós-auditoria anônima). */
export function trackSaveClicked() {
  track("save_clicked");
}

/** Usuário compartilhou o resultado (Web Share API ou download). */
export function trackShareClicked(method: "native" | "download" | "clipboard") {
  track("share_clicked", { method });
}

/** Usuário clicou em qualquer CTA da landing page. */
export function trackLandingCTA(location: "hero" | "how_it_works" | "pricing" | "final") {
  track("landing_cta_clicked", { location });
}

/** Usuário iniciou o processo de assinatura (quando implementado). */
export function trackSubscriptionStarted() {
  track("subscription_started");
}
