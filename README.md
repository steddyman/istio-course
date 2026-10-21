# Istio Ingress & Egress

An interactive course on every object needed to run Istio ingress and egress gateways: the Istio CRDs in the gateway namespaces and in tenant namespaces that receive and send traffic, plus the Kubernetes and cert-manager objects they depend on.

It covers eight traffic paths:

| Ingress | Egress |
|---|---|
| HTTPS, TLS terminated at the gateway | TLS origination at the egress gateway |
| Mutual TLS with client certificates | Mutual TLS origination with a client certificate |
| TLS passthrough to the app | TLS passthrough from the app |
| Raw TCP | Raw TCP to an external database |

Each path has a step-through request diagram, an object relationship map, annotated YAML for every object, verification commands and common mistakes.

## Running locally

The page loads `objects.js` and `scenarios.js` from the same folder, so serve it over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

- `index.html`: page, styles and app logic
- `objects.js`: every object, with YAML and teaching notes
- `scenarios.js`: which objects each path uses, how they reference each other, and the request walkthroughs
