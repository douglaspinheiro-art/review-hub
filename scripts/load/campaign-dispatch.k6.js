import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
  },
};

const BASE_URL = __ENV.BASE_URL;
const ANON_KEY = __ENV.ANON_KEY;
const USER_JWT = __ENV.USER_JWT;
const CAMPAIGN_ID = __ENV.CAMPAIGN_ID;

export default function () {
  const res = http.post(
    `${BASE_URL}/functions/v1/dispatch-campaign`,
    JSON.stringify({ campaign_id: CAMPAIGN_ID }),
    {
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${USER_JWT}`,
      },
    },
  );

  check(res, {
    "status is 200 or 409": (r) => r.status === 200 || r.status === 409,
  });

  sleep(1);
}
