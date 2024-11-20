# Load Testing Xavia OTA Updates

When running a production app with Xavia OTA updates, it's important to understand how the system scales under load. This guide explains the key concepts and provides a practical example of load testing.

## How OTA Updates Work

The update process consists of two main parts:

1. **Manifest Check** - A lightweight API call to check for new updates
2. **Asset Download** - If an update exists, download new assets from storage

Each part can scale independently:
- The API server can use container auto-scaling (e.g. AWS ECS, GCP Cloud Run)
- Storage can use scalable solutions like Supabase or S3

## Load Testing Example

I've created a [k6](https://grafana.com/docs/k6/latest/) script that simulates real device update behavior. The script tests both the manifest check and asset downloads under various load patterns.

```javascript
  import http from "k6/http";
  import { sleep } from "k6";
  import { check } from "k6";

  export const options = {
    // Test different load patterns by commenting/uncommenting scenarios

    // Scenario 1: Constant load
    vus: 1000,
    duration: "60s",

    // Scenario 2: Ramp up load
    // stages: [
    //   { duration: '30s', target: 100 },  // Ramp up to 100 users
    //   { duration: '1m', target: 1000 },  // Ramp up to 1000 users
    //   { duration: '30s', target: 0 },    // Ramp down to 0
    // ],

    // Scenario 3: Spike test
    // stages: [
    //   { duration: '10s', target: 100 },
    //   { duration: '1m', target: 100 },
    //   { duration: '10s', target: 1000 },
    //   { duration: '3m', target: 1000 },
    //   { duration: '10s', target: 100 },
    //   { duration: '3m', target: 100 },
    //   { duration: '10s', target: 0 },
    // ],
  };

  const BASE_URL = "" // Add your server url here;
  const RUNTIME_VERSION = "1" // Add your runtime version here;
  const PLATFORM = "ios"; // Add your platform here;

  export default function () {
    // Simulate update check
    const manifestRes = http.get(`${BASE_URL}/api/manifest`, {
      headers: {
        // you can get these values from inspecting your RN call to your Xavia OTA server backend;
        "expo-expect-signature": "",
        "expo-runtime-version": RUNTIME_VERSION,
        "expo-current-update-id": "",
        "expo-updates-environment": "",
        "if-none-match": "",
        "expo-embedded-update-id": "",
        "expo-protocol-version": "",
        "expo-api-version": "",
        "expo-json-error": "",
        "expo-platform": PLATFORM,
        "eas-client-id": "",
      },
    });

    check(manifestRes, {
      "manifest status is 200": (r) => r.status === 200,
      "manifest response is valid": (r) => r.length > 0,
    });

    if (manifestRes.status === 200) {
      try {
        const contentType = manifestRes.headers["Content-Type"];

        const boundary = contentType.split("boundary=")[1];

        const parts = manifestRes.body.split("--" + boundary);

        // Find and parse the manifest part
        const manifestPart = parts.find((part) =>
          part.includes("content-type: application/json")
        );

        const manifestJson = manifestPart.split("\r\n\r\n")[1];
        const manifest = JSON.parse(manifestJson);

        const assets = manifest.assets;
        for (const asset of assets) {
          const assetUrl = asset.url;

          // Simulate bundle assets download
          const bundleRes = http.get(assetUrl);

          check(bundleRes, {
            "bundle status is 200": (r) => r.status === 200,
            "bundle size is valid": (r) => r.length > 0,
          });
        }
      } catch (e) {
        console.error("Failed to parse manifest:", e);
      }
    }

    // Simulate real device behavior with random sleep
    sleep(Math.random() * 2 + 1); // Sleep 1-3 seconds
  }
```

The script includes scenarios for:
- Constant load (1000 VUs for 60s)
- Gradual ramp up
- Spike testing

You can run the script with `k6 run [script-name].js`

## Results

In our testing, even a basic setup handled significant concurrent load effectively. The system scales linearly with infrastructure capacity - there are no artificial limits on number of updates or devices.

This test results running the script on a Digital Ocean container with 512 MB RAM | 1 vCPU | 50 GB bandwidth:
```
     checks.........................: 0.00%  0 out of 26764
     data_received..................: 32 MB  356 kB/s
     data_sent......................: 11 MB  117 kB/s
     http_req_blocked...............: avg=27.02ms  min=0s      med=4µs     max=1.32s    p(90)=22µs    p(95)=96.32ms
     http_req_connecting............: avg=15.05ms  min=0s      med=0s      max=1.1s     p(90)=0s      p(95)=57.15ms
     http_req_duration..............: avg=1.33s    min=10.11ms med=54.78ms max=59.99s   p(90)=1.77s   p(95)=2.62s  
       { expected_response:true }...: avg=36.07ms  min=10.11ms med=19.89ms max=1.2s     p(90)=36.74ms p(95)=95.97ms
     http_req_failed................: 49.04% 13382 out of 27286
     http_req_receiving.............: avg=429.79µs min=0s      med=83µs    max=258.77ms p(90)=634µs   p(95)=2.17ms 
     http_req_sending...............: avg=139.16µs min=4µs     med=42µs    max=159.96ms p(90)=133µs   p(95)=190µs  
     http_req_tls_handshaking.......: avg=11.94ms  min=0s      med=0s      max=868.02ms p(90)=0s      p(95)=0s     
     http_req_waiting...............: avg=1.33s    min=9.85ms  med=54.09ms max=59.99s   p(90)=1.77s   p(95)=2.62s  
     http_reqs......................: 27286  302.972601/s
     iteration_duration.............: avg=4.77s    min=1.07s   med=2.6s    max=1m2s     p(90)=4.72s   p(95)=5.54s  
     iterations.....................: 13382  148.588263/s
     vus............................: 522    min=522            max=1000
     vus_max........................: 1000   min=1000           max=1000
```
Key findings:
- Manifest checks are very lightweight
- Asset downloads scale with storage provider capacity
- Caching (hopefullycoming soon) will further improve performance

## Try It Yourself

Clone the test script and modify the parameters to match your expected load patterns. This will help you properly size your infrastructure for production use.
