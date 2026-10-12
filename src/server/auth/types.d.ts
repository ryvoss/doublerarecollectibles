import type { AdminIdentity } from "./passportFactory";

declare global {
  namespace Express {
    interface User extends AdminIdentity {}
  }
}

export {};
