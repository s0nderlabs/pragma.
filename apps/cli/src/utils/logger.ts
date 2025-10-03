import pino from "pino";

export const onboardingLogger = pino({
  name: "pragma-cli-onboarding",
  level: process.env.PRETTY_LOGS ? "debug" : "info",
});
