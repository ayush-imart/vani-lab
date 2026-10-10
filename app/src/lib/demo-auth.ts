// DEMO ONLY: a local flag, not authentication. No identity is validated and no OAuth happens.
const DEMO_SIGN_IN_KEY = "vani.demo.signedIn";

export function isDemoSignedIn(): boolean {
  try {
    return localStorage.getItem(DEMO_SIGN_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function demoSignIn(): void {
  try {
    localStorage.setItem(DEMO_SIGN_IN_KEY, "1");
  } catch {
    /* storage unavailable: the demo flag cannot persist */
  }
}

export function demoSignOut(): void {
  try {
    localStorage.removeItem(DEMO_SIGN_IN_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
