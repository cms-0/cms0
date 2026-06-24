---
"@cms0/cms0": patch
---

Fix `Invalid collection response` errors on root array collections (e.g. `cms.myCollection()`) by routing all SDK reads — collections, models, by-id, and nested field reads — through the `_graph` endpoint, matching the behavior singleton root objects already used. Previously only singleton roots used `_graph`; collection and model-ref reads hit the admin content wrapper instead, which doesn't match the shape the SDK's collection envelope parser expects.
