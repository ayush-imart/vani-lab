import { httpBasic, localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// Route auth for the Judge agent. The Hono API is the only caller and sends this shared secret
// (HTTP Basic). With no secret configured only `eve dev` is accepted (fails closed in production).
const secret = process.env.EVE_API_SECRET;

export default eveChannel({
  auth: secret ? [httpBasic({ username: "vani-api", password: secret }), localDev()] : [localDev()],
});
