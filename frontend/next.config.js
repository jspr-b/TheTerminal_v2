const { PHASE_PRODUCTION_BUILD } = require("next/constants");

/**
 * NEXT_PUBLIC_* values are written into the shipped JavaScript as plain text.
 * A dev token in a production build hands a working login to every visitor,
 * so refuse to build with one. Use `npm run dev` for local work with the token.
 */
module.exports = (phase) => {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_DEV_TOKEN) {
    throw new Error(
      "NEXT_PUBLIC_DEV_TOKEN is set. It would be baked into the public JavaScript. " +
        "Unset it (and remove it from .env files) before `next build`.",
    );
  }
  // Sell-out risk is not backtested yet (CLAUDE.md): only local dev may show it.
  if (phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_SHOW_UNTESTED) {
    throw new Error("NEXT_PUBLIC_SHOW_UNTESTED is set. Untested predictions must not reach a production build.");
  }
  // Made-up sample cards are a local design preview only: never in a shipped build.
  if (phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_SHOW_SAMPLES) {
    throw new Error("NEXT_PUBLIC_SHOW_SAMPLES is set. Sample (made-up) data must not reach a production build.");
  }
  /** @type {import('next').NextConfig} */
  return { reactStrictMode: true };
};
