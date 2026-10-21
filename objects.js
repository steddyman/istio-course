/* Istio Ingress & Egress course: object registry.
   Every Kubernetes / Istio / cert-manager object used in the course is defined once here.
   In YAML strings, text after "#!" on a line is a teaching note: it is shown as a numbered
   annotation and stripped from the copyable YAML. */

window.KINDS = {
  HelmValues: { api: 'Helm chart values', fam: 'install', desc: 'Input to a Helm chart rather than a Kubernetes object. The istiod chart turns meshConfig into the mesh-wide configuration; the gateway chart generates the gateway Deployment, Service, ServiceAccount, Role, RoleBinding, HPA and PDB shown separately in this course.' },
  Namespace: { api: 'v1', fam: 'k8s', desc: 'A boundary for names, RBAC and policy. Istio uses namespace labels to decide whether pods get a sidecar, and many Istio objects apply namespace-wide.' },
  ServiceAccount: { api: 'v1', fam: 'k8s', desc: 'The workload identity. Istio issues every pod a certificate whose SPIFFE ID is built from its namespace and ServiceAccount: spiffe://cluster.local/ns/<ns>/sa/<sa>. AuthorizationPolicies refer to it as a principal.' },
  Deployment: { api: 'apps/v1', fam: 'k8s', desc: 'Runs the pods. For gateways, the pods are standalone Envoy proxies; for applications, each pod gets the app container plus an injected istio-proxy sidecar.' },
  Service: { api: 'v1', fam: 'k8s', desc: 'A stable name and port set for a group of pods. Istio builds its service registry from Services, and reads the port name prefix (http-, tcp-, tls-) or appProtocol to pick the protocol.' },
  Secret: { api: 'v1', fam: 'k8s', desc: 'Holds key material. Gateways read TLS Secrets by name (credentialName) through istiod over SDS; applications mount them as files.' },
  ConfigMap: { api: 'v1', fam: 'k8s', desc: 'Non-secret configuration files for an application.' },
  Role: { api: 'rbac.authorization.k8s.io/v1', fam: 'k8s', desc: 'Namespaced permissions. Gateways need permission to read Secrets in their own namespace, otherwise istiod refuses to serve credentialName certificates to them.' },
  RoleBinding: { api: 'rbac.authorization.k8s.io/v1', fam: 'k8s', desc: 'Grants a Role to a subject, here the gateway ServiceAccount.' },
  PodDisruptionBudget: { api: 'policy/v1', fam: 'k8s', desc: 'Keeps a minimum number of gateway pods running during node drains and upgrades.' },
  NetworkPolicy: { api: 'networking.k8s.io/v1', fam: 'k8s', desc: 'Layer 3/4 firewall enforced by the CNI plugin, independent of Istio. Used to stop pods bypassing the egress gateway by connecting to the internet directly.' },
  ClusterIssuer: { api: 'cert-manager.io/v1', fam: 'cm', desc: 'A cluster-wide certificate authority configuration for cert-manager (ACME/Let\'s Encrypt, a private CA, Vault, and so on). Certificates in any namespace can reference it.' },
  Certificate: { api: 'cert-manager.io/v1', fam: 'cm', desc: 'A request for a certificate. cert-manager obtains it from the referenced issuer, writes it into a Secret in the same namespace, and renews it before expiry.' },
  Gateway: { api: 'networking.istio.io/v1', fam: 'istio', desc: 'Configures the listeners of a set of gateway Envoy pods: which ports to open, which hostnames to accept, and how to handle TLS on each (SIMPLE, MUTUAL, PASSTHROUGH, ISTIO_MUTUAL). It opens the door but routes nothing; a VirtualService bound to it does the routing.' },
  VirtualService: { api: 'networking.istio.io/v1', fam: 'istio', desc: 'Routing rules for a host. Bound to a Gateway, it routes traffic entering through that gateway; bound to the reserved name mesh, it changes how sidecars route traffic. Has http routes (Host, path, headers), tls routes (SNI) and tcp routes (port).' },
  DestinationRule: { api: 'networking.istio.io/v1', fam: 'istio', desc: 'Policy for the client side of a connection, applied after routing: the TLS mode the sender uses (ISTIO_MUTUAL, SIMPLE, MUTUAL, DISABLE), SNI, client certificates, load balancing, connection pools, outlier detection and named subsets.' },
  ServiceEntry: { api: 'networking.istio.io/v1', fam: 'istio', desc: 'Adds a host to Istio\'s service registry, usually an external one. With outboundTrafficPolicy REGISTRY_ONLY, an external host without a ServiceEntry cannot be reached at all.' },
  Sidecar: { api: 'networking.istio.io/v1', fam: 'istio', desc: 'Controls what the sidecars in a namespace can see (egress hosts) and how they treat unknown destinations. Smaller config per proxy, and a hard boundary on which namespaces a tenant can reach.' },
  PeerAuthentication: { api: 'security.istio.io/v1', fam: 'istio', desc: 'Server-side rule for incoming mesh traffic at sidecars: STRICT accepts only Istio mTLS, PERMISSIVE accepts mTLS and plaintext, DISABLE accepts plaintext. It does not apply to gateway listeners, which are defined by Gateway objects.' },
  AuthorizationPolicy: { api: 'security.istio.io/v1', fam: 'istio', desc: 'Access control enforced by the receiving proxy, sidecar or gateway. ALLOW / DENY / CUSTOM rules match on caller identity (principal), namespace, source IP, port, Host, path, method, SNI and more.' },
  GatewayAPIGateway: { api: 'gateway.networking.k8s.io/v1', fam: 'gwapi', label: 'Gateway', desc: 'Kubernetes Gateway API Gateway. With gatewayClassName istio, Istio deploys the Envoy Deployment and Service for you and configures its listeners.' },
  HTTPRoute: { api: 'gateway.networking.k8s.io/v1', fam: 'gwapi', desc: 'Kubernetes Gateway API HTTP routing, the equivalent of a VirtualService http route bound to a gateway.' }
};

window.OBJ = {};
function O(id, o) { window.OBJ[id] = Object.assign({ id: id }, o); }

/* ------------------------------------------------------------------ */
/* Install and platform foundation                                     */
/* ------------------------------------------------------------------ */

O('helm-istiod', {
  kind: 'HelmValues', name: 'values-istiod.yaml', ns: 'istio-system', owner: 'platform', req: 'required',
  why: 'Mesh-wide settings read by istiod and pushed to every proxy. Two of them shape gateway work: REGISTRY_ONLY turns ServiceEntries into an allowlist for external traffic, and DNS proxying lets ServiceEntries for external TCP hosts work. The istio/base chart installed first contains the CRDs themselves (Gateway, VirtualService, DestinationRule and the rest).',
  yaml: `# helm repo add istio https://istio-release.storage.googleapis.com/charts
# helm install istio-base istio/base -n istio-system --create-namespace
# helm install istiod istio/istiod -n istio-system -f values-istiod.yaml --wait
meshConfig:
  outboundTrafficPolicy:
    mode: REGISTRY_ONLY  #! Unknown external hosts go to the BlackHoleCluster (connection reset / 502). Only Kubernetes Services and ServiceEntry hosts are reachable. The default, ALLOW_ANY, lets apps call anything directly, which defeats an egress gateway.
  accessLogFile: /dev/stdout  #! Optional but invaluable: Envoy access logs on every proxy, including response flags like NR (no route) and UF (upstream connect failure).
  defaultConfig:
    proxyMetadata:
      ISTIO_META_DNS_CAPTURE: "true"  #! The sidecar answers the app's DNS queries itself, so ServiceEntry hosts resolve inside the pod.
      ISTIO_META_DNS_AUTO_ALLOCATE: "true"  #! Gives each ServiceEntry host that has no addresses a virtual IP (240.240.0.0/16). TCP has no Host header, so that IP is how a sidecar tells two external TCP services on the same port apart. Recent Istio releases can allocate these in istiod instead; check the release notes for your version.`
});

O('helm-ingress', {
  kind: 'HelmValues', name: 'values-ingress.yaml', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Installs the ingress gateway with the istio/gateway chart. The release name istio-ingressgateway becomes the Deployment and Service name and produces the pod label istio=ingressgateway that every ingress Gateway object selects. The chart generates the objects shown separately in this module; you need either the chart or those objects, not both.',
  yaml: `# helm install istio-ingressgateway istio/gateway -n istio-ingress --create-namespace -f values-ingress.yaml
service:
  type: LoadBalancer  #! Your cloud provider gives the gateway a public address.
  externalTrafficPolicy: Local  #! Optional. Preserves the client source IP so AuthorizationPolicy remoteIpBlocks can filter by it.
  ports:  #! Setting service.ports replaces the chart's default list, so the defaults are repeated here.
  - name: status-port
    port: 15021
    targetPort: 15021  #! Readiness endpoint that the cloud load balancer health-checks.
  - name: http2
    port: 80
    targetPort: 80
  - name: https
    port: 443
    targetPort: 443  #! Shared by HTTPS (SIMPLE and MUTUAL) and TLS PASSTHROUGH servers. Envoy picks the matching server by SNI.
  - name: tcp-ledger
    port: 5432
    targetPort: 5432  #! Required for the raw TCP scenario. A Gateway server on a port that the Service does not expose is unreachable.
autoscaling:
  minReplicas: 2
  maxReplicas: 5  #! Optional. The chart creates a HorizontalPodAutoscaler.
podDisruptionBudget:
  minAvailable: 1  #! Optional. The chart creates a PodDisruptionBudget.`
});

O('helm-egress', {
  kind: 'HelmValues', name: 'values-egress.yaml', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Installs the egress gateway with the same istio/gateway chart. The release name istio-egressgateway gives the Service istio-egressgateway.istio-egress.svc.cluster.local and the pod label istio=egressgateway. Every port that a sidecar sends to must be listed here.',
  yaml: `# helm install istio-egressgateway istio/gateway -n istio-egress --create-namespace -f values-egress.yaml
service:
  type: ClusterIP  #! Egress gateways only receive traffic from inside the mesh, so no external address.
  ports:
  - name: status-port
    port: 15021
    targetPort: 15021
  - name: http2
    port: 80
    targetPort: 80  #! Sidecars send TLS-origination traffic here, wrapped in Istio mTLS.
  - name: https
    port: 443
    targetPort: 443  #! TLS passthrough traffic, still encrypted with the app's own TLS.
  - name: tls-backup-db
    port: 5443
    targetPort: 5443  #! Istio mTLS tunnel carrying raw TCP to backup-db.example.org. A port of our choosing; it only has to match the Gateway server and DestinationRule.
autoscaling:
  minReplicas: 2
  maxReplicas: 5`
});

O('ns-istio-system', {
  kind: 'Namespace', name: 'istio-system', ns: '', owner: 'platform', req: 'required',
  why: 'Home of istiod, the control plane. It is the mesh root namespace: PeerAuthentication and similar policies placed here apply to the whole mesh.',
  yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: istio-system  #! Root namespace (meshConfig.rootNamespace defaults to istio-system). istiod runs here; no injection label, because istiod is not a sidecar workload.`
});

O('ns-istio-ingress', {
  kind: 'Namespace', name: 'istio-ingress', ns: '', owner: 'platform', req: 'required',
  why: 'Keeps the ingress gateway, its Gateway objects and its TLS private keys apart from istiod and from tenants. Only the platform team needs write access here.',
  yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: istio-ingress  #! Separate from istio-system so the gateway can be upgraded, scaled and access-controlled on its own.
  labels:
    istio-injection: enabled  #! Injection must not be disabled here. Gateway pods start with a placeholder container (image: auto) that the injector turns into a configured Envoy. The pod label sidecar.istio.io/inject=true also works if the namespace is unlabeled.`
});

O('ns-istio-egress', {
  kind: 'Namespace', name: 'istio-egress', ns: '', owner: 'platform', req: 'required',
  why: 'Holds the egress gateway, the egress Gateway objects, the TLS-origination DestinationRules, client certificates for external services, and the egress allowlist policy.',
  yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: istio-egress  #! Pods here are the only ones allowed to open connections to the internet once the tenant NetworkPolicies are in place.
  labels:
    istio-injection: enabled`
});

O('pa-mesh', {
  kind: 'PeerAuthentication', name: 'default', ns: 'istio-system', owner: 'platform', req: 'recommended',
  why: 'Makes Istio mTLS mandatory for every sidecar in the mesh. Gateways still need it on the inside: the hops gateway-to-app and app-to-egress-gateway are Istio mTLS, which proves the caller\'s identity for AuthorizationPolicy.',
  yaml: `apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default  #! Mesh-wide policies must be named default and live in the root namespace.
  namespace: istio-system
spec:
  mtls:
    mode: STRICT  #! Sidecars reject plaintext. During a migration use PERMISSIVE first, then switch.`
});

/* Ingress gateway workload */
O('igw-sa', {
  kind: 'ServiceAccount', name: 'istio-ingressgateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Identity of the ingress gateway. Tenant AuthorizationPolicies allow the principal cluster.local/ns/istio-ingress/sa/istio-ingressgateway, so only traffic that came through the gateway reaches their apps.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: istio-ingressgateway  #! SPIFFE ID: spiffe://cluster.local/ns/istio-ingress/sa/istio-ingressgateway
  namespace: istio-ingress`
});

O('igw-deploy', {
  kind: 'Deployment', name: 'istio-ingressgateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'The ingress gateway itself: standalone Envoy pods at the edge of the mesh. The label istio=ingressgateway is the contract between these pods and every ingress Gateway object.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: istio-ingressgateway
  namespace: istio-ingress
spec:
  replicas: 2
  selector:
    matchLabels:
      istio: ingressgateway
  template:
    metadata:
      annotations:
        inject.istio.io/templates: gateway  #! Use the gateway injection template: Envoy is the main process, not a sidecar next to an app container.
      labels:
        app: istio-ingressgateway
        istio: ingressgateway  #! Selected by spec.selector in every ingress Gateway, by the Service, and by gateway-level AuthorizationPolicies.
        sidecar.istio.io/inject: "true"  #! Opt this pod in to injection.
    spec:
      serviceAccountName: istio-ingressgateway  #! Gives the gateway its mesh identity.
      securityContext:
        sysctls:
        - name: net.ipv4.ip_unprivileged_port_start
          value: "0"  #! Lets the non-root Envoy bind ports 80 and 443 directly.
      containers:
      - name: istio-proxy
        image: auto  #! Replaced at injection time with the proxy image matching istiod.`
});

O('igw-svc', {
  kind: 'Service', name: 'istio-ingressgateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Exposes the gateway pods to the internet through a cloud load balancer. A port opened by a Gateway object is only reachable if it is also listed here.',
  yaml: `apiVersion: v1
kind: Service
metadata:
  name: istio-ingressgateway
  namespace: istio-ingress
spec:
  type: LoadBalancer  #! External IP / hostname for your DNS records (shop.example.com and friends point here).
  externalTrafficPolicy: Local  #! Optional: keeps client source IPs.
  selector:
    istio: ingressgateway
  ports:
  - name: status-port
    port: 15021
    targetPort: 15021
  - name: http2
    port: 80
    targetPort: 80
  - name: https
    port: 443
    targetPort: 443  #! HTTPS SIMPLE, HTTPS MUTUAL and TLS PASSTHROUGH all share 443; SNI chooses the Gateway server.
  - name: tcp-ledger
    port: 5432
    targetPort: 5432  #! Raw TCP for the ledger database. Forgetting this port is the most common TCP ingress mistake.`
});

O('igw-role', {
  kind: 'Role', name: 'istio-ingressgateway-sds', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'istiod reads credentialName Secrets and streams them to the gateway over SDS, but first runs a SubjectAccessReview to check that the gateway\'s ServiceAccount may read Secrets in its namespace. Without this Role the gateway gets no certificate and TLS handshakes fail.',
  yaml: `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: istio-ingressgateway-sds
  namespace: istio-ingress  #! Only Secrets in the gateway's own namespace. This is why credentialName Secrets must live here.
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "watch", "list"]`
});

O('igw-rb', {
  kind: 'RoleBinding', name: 'istio-ingressgateway-sds', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Grants the Secret-reading Role to the ingress gateway ServiceAccount.',
  yaml: `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: istio-ingressgateway-sds
  namespace: istio-ingress
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: istio-ingressgateway-sds
subjects:
- kind: ServiceAccount
  name: istio-ingressgateway  #! Must be the ServiceAccount used by the gateway pods.`
});

O('igw-pdb', {
  kind: 'PodDisruptionBudget', name: 'istio-ingressgateway', ns: 'istio-ingress', owner: 'platform', req: 'optional',
  why: 'Keeps at least one ingress gateway pod serving while nodes are drained.',
  yaml: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: istio-ingressgateway
  namespace: istio-ingress
spec:
  minAvailable: 1
  selector:
    matchLabels:
      istio: ingressgateway`
});

/* Egress gateway workload */
O('egw-sa', {
  kind: 'ServiceAccount', name: 'istio-egressgateway', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Identity of the egress gateway, presented to sidecars during the Istio mTLS hop.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: istio-egressgateway  #! SPIFFE ID: spiffe://cluster.local/ns/istio-egress/sa/istio-egressgateway
  namespace: istio-egress`
});

O('egw-deploy', {
  kind: 'Deployment', name: 'istio-egressgateway', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'The egress gateway: a dedicated exit point where traffic leaving the mesh can be inspected, authorized, logged and given TLS. Selected by egress Gateway objects through istio=egressgateway.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: istio-egressgateway
  namespace: istio-egress
spec:
  replicas: 2
  selector:
    matchLabels:
      istio: egressgateway
  template:
    metadata:
      annotations:
        inject.istio.io/templates: gateway
      labels:
        app: istio-egressgateway
        istio: egressgateway  #! Selected by every egress Gateway object and by the egress AuthorizationPolicy.
        sidecar.istio.io/inject: "true"
    spec:
      serviceAccountName: istio-egressgateway
      securityContext:
        sysctls:
        - name: net.ipv4.ip_unprivileged_port_start
          value: "0"
      containers:
      - name: istio-proxy
        image: auto`
});

O('egw-svc', {
  kind: 'Service', name: 'istio-egressgateway', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'The in-mesh address sidecars send external traffic to. Tenant VirtualServices and DestinationRules name it by its full host istio-egressgateway.istio-egress.svc.cluster.local.',
  yaml: `apiVersion: v1
kind: Service
metadata:
  name: istio-egressgateway  #! Host used in routes: istio-egressgateway.istio-egress.svc.cluster.local
  namespace: istio-egress
spec:
  type: ClusterIP
  selector:
    istio: egressgateway
  ports:
  - name: status-port
    port: 15021
    targetPort: 15021
  - name: http2
    port: 80
    targetPort: 80  #! TLS origination hop (Istio mTLS from the sidecar, HTTP inside).
  - name: https
    port: 443
    targetPort: 443  #! TLS passthrough hop.
  - name: tls-backup-db
    port: 5443
    targetPort: 5443  #! Istio mTLS tunnel for raw TCP.`
});

O('egw-role', {
  kind: 'Role', name: 'istio-egressgateway-sds', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Needed as soon as a DestinationRule applied at the egress gateway uses credentialName (mutual TLS origination). istiod checks this permission before serving the client certificate.',
  yaml: `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: istio-egressgateway-sds
  namespace: istio-egress
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "watch", "list"]`
});

O('egw-rb', {
  kind: 'RoleBinding', name: 'istio-egressgateway-sds', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Grants the Secret-reading Role to the egress gateway ServiceAccount.',
  yaml: `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: istio-egressgateway-sds
  namespace: istio-egress
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: istio-egressgateway-sds
subjects:
- kind: ServiceAccount
  name: istio-egressgateway`
});

/* ------------------------------------------------------------------ */
/* Certificates                                                        */
/* ------------------------------------------------------------------ */

O('ci-letsencrypt', {
  kind: 'ClusterIssuer', name: 'letsencrypt-dns', ns: '', owner: 'platform', req: 'required',
  why: 'Public CA for the certificates browsers and external clients must trust: shop.example.com, partners.shop.example.com and docs.billing.example.com. Cluster-scoped, so Certificates in istio-ingress and in billing can both use it.',
  yaml: `apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform@example.com
    privateKeySecretRef:
      name: letsencrypt-dns-account-key  #! ACME account key, stored in the cert-manager namespace.
    solvers:
    - dns01:  #! DNS-01 proves ownership with a TXT record. It works for every host here, including the passthrough host, where the gateway cannot answer HTTP-01 challenges because it never decrypts that traffic.
        route53:
          region: eu-west-1
          hostedZoneID: Z0EXAMPLE12345  #! Example for AWS Route 53. Use the dns01 solver block for your DNS provider.`
});

O('ci-selfsigned', {
  kind: 'ClusterIssuer', name: 'selfsigned-bootstrap', ns: '', owner: 'platform', req: 'required',
  why: 'Used once, to self-sign the private root CA that issues partner client certificates.',
  yaml: `apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-bootstrap
spec:
  selfSigned: {}  #! Signs a certificate with its own key. Only the root CA below uses it.`
});

O('cert-partner-root', {
  kind: 'Certificate', name: 'partner-root-ca', ns: 'cert-manager', owner: 'platform', req: 'required',
  why: 'The private CA that partner client certificates chain up to. The ingress gateway trusts its public certificate (ca.crt) for mutual TLS.',
  yaml: `apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: partner-root-ca
  namespace: cert-manager  #! A CA-type ClusterIssuer reads its Secret from cert-manager's cluster resource namespace (cert-manager by default).
spec:
  isCA: true
  commonName: Shop Partner Root CA
  secretName: partner-root-ca
  duration: 87600h  #! 10 years. Rotating a client CA means re-issuing every partner certificate, so roots are long-lived.
  privateKey:
    algorithm: ECDSA
    size: 256
  issuerRef:
    name: selfsigned-bootstrap
    kind: ClusterIssuer`
});

O('sec-partner-root', {
  kind: 'Secret', name: 'partner-root-ca', ns: 'cert-manager', owner: 'platform', req: 'required',
  why: 'Written by cert-manager. Holds the CA private key, so it never leaves the cert-manager namespace. Only its public ca.crt is copied to the gateway namespace.',
  yaml: `apiVersion: v1
kind: Secret
metadata:
  name: partner-root-ca
  namespace: cert-manager
type: kubernetes.io/tls
data:
  tls.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! CA certificate.
  tls.key: LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0t...  #! CA private key. Anyone holding it can mint partner certificates.
  ca.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! For a self-signed root, the same as tls.crt. This public part is what the gateway needs.`
});

O('ci-partner-ca', {
  kind: 'ClusterIssuer', name: 'partner-ca', ns: '', owner: 'platform', req: 'required',
  why: 'Issues client certificates to partners, signed by the partner root CA.',
  yaml: `apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: partner-ca
spec:
  ca:
    secretName: partner-root-ca  #! Looked up in the cert-manager namespace.`
});

O('cert-partner-client', {
  kind: 'Certificate', name: 'client-acme-logistics', ns: 'cert-manager', owner: 'platform', req: 'required',
  why: 'One client certificate per partner. You hand tls.crt and tls.key to the partner over a secure channel; their system presents it to partners.shop.example.com. If partners bring certificates from their own CA, skip this and put their CA in the -cacert Secret instead.',
  yaml: `apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: client-acme-logistics
  namespace: cert-manager
spec:
  secretName: client-acme-logistics
  commonName: acme-logistics
  dnsNames:
  - acme-logistics.partners.shop.example.com  #! SAN the Gateway can require through tls.subjectAltNames, so one partner's cert cannot be used as another's.
  usages:
  - client auth  #! extendedKeyUsage clientAuth: valid for proving identity as a client, not for serving.
  - digital signature
  duration: 2160h
  renewBefore: 360h
  issuerRef:
    name: partner-ca
    kind: ClusterIssuer`
});

O('cert-shop', {
  kind: 'Certificate', name: 'shop-example-com', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Obtains and renews the public server certificate for shop.example.com. It lives in istio-ingress because the Secret it writes must be in the gateway pods\' namespace.',
  yaml: `apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: shop-example-com
  namespace: istio-ingress  #! Same namespace as the ingress gateway pods; credentialName is resolved there.
spec:
  secretName: shop-example-com-tls  #! The Secret cert-manager writes. Gateway tls.credentialName uses this exact name.
  dnsNames:
  - shop.example.com
  issuerRef:
    name: letsencrypt-dns
    kind: ClusterIssuer
  privateKey:
    algorithm: ECDSA
    size: 256
    rotationPolicy: Always  #! A fresh private key on every renewal.
  renewBefore: 720h  #! Renew 30 days ahead. istiod pushes the renewed Secret to the gateway without a restart.`
});

O('sec-shop-tls', {
  kind: 'Secret', name: 'shop-example-com-tls', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Server certificate and key for shop.example.com, served by the gateway for SNI shop.example.com.',
  yaml: `apiVersion: v1
kind: Secret
metadata:
  name: shop-example-com-tls
  namespace: istio-ingress
  annotations:
    cert-manager.io/certificate-name: shop-example-com  #! Managed by cert-manager. Don't edit by hand; it will be overwritten on renewal.
type: kubernetes.io/tls
data:
  tls.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! Leaf certificate followed by intermediates (full chain), base64 PEM.
  tls.key: LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0t...  #! Private key.`
});

O('cert-partners', {
  kind: 'Certificate', name: 'partners-shop-example-com', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Server certificate for partners.shop.example.com. Mutual TLS still needs a normal server certificate: the client verifies the gateway, and the gateway verifies the client.',
  yaml: `apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: partners-shop-example-com
  namespace: istio-ingress
spec:
  secretName: partners-shop-example-com-tls
  dnsNames:
  - partners.shop.example.com
  issuerRef:
    name: letsencrypt-dns  #! Public CA, so partners trust the server without extra setup. The client CA is a separate concern.
    kind: ClusterIssuer
  privateKey:
    algorithm: ECDSA
    size: 256
    rotationPolicy: Always`
});

O('sec-partners-tls', {
  kind: 'Secret', name: 'partners-shop-example-com-tls', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Server certificate and key for partners.shop.example.com.',
  yaml: `apiVersion: v1
kind: Secret
metadata:
  name: partners-shop-example-com-tls
  namespace: istio-ingress
type: kubernetes.io/tls
data:
  tls.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...
  tls.key: LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0t...  #! An ACME issuer does not add ca.crt here, so Istio looks for the client CA in the -cacert Secret.`
});

O('sec-partners-cacert', {
  kind: 'Secret', name: 'partners-shop-example-com-tls-cacert', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'The trust anchor for client certificates. The gateway accepts a client only if its certificate chains to a CA in this ca.crt.',
  yaml: `# kubectl get secret partner-root-ca -n cert-manager -o jsonpath='{.data.ca\\.crt}' | base64 -d > partner-ca.pem
# kubectl create secret generic partners-shop-example-com-tls-cacert -n istio-ingress --from-file=ca.crt=partner-ca.pem
apiVersion: v1
kind: Secret
metadata:
  name: partners-shop-example-com-tls-cacert  #! Naming rule: <credentialName>-cacert. Alternatively add ca.crt to the main Secret; keep one source so it is clear which CA is trusted.
  namespace: istio-ingress
type: Opaque
data:
  ca.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! Public certificate(s) of the partner CA only, never the key. Several PEM blocks are allowed, for example during a CA rotation.`
});

O('cert-docs', {
  kind: 'Certificate', name: 'docs-billing-example-com', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'With passthrough the gateway never decrypts, so the application presents the server certificate. The Certificate and its Secret therefore live in the tenant namespace, next to the app, not in istio-ingress.',
  yaml: `apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: docs-billing-example-com
  namespace: billing  #! The app's namespace: the pod mounts the Secret as files.
spec:
  secretName: docs-billing-example-com-tls
  dnsNames:
  - docs.billing.example.com
  issuerRef:
    name: letsencrypt-dns
    kind: ClusterIssuer
  privateKey:
    algorithm: ECDSA
    size: 256
    rotationPolicy: Always`
});

O('sec-docs-tls', {
  kind: 'Secret', name: 'docs-billing-example-com-tls', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Mounted into the secure-docs pod; nginx serves it on port 8443.',
  yaml: `apiVersion: v1
kind: Secret
metadata:
  name: docs-billing-example-com-tls
  namespace: billing
type: kubernetes.io/tls
data:
  tls.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! Appears in the pod as /etc/nginx/tls/tls.crt
  tls.key: LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0t...  #! Appears as /etc/nginx/tls/tls.key`
});

O('sec-bank-client', {
  kind: 'Secret', name: 'bank-client-credential', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'The client certificate the egress gateway presents to bank.example.net, plus the CA used to verify the bank. It lives in istio-egress because the gateway that originates the TLS runs there.',
  yaml: `# kubectl create secret generic bank-client-credential -n istio-egress --from-file=tls.crt=client.pem --from-file=tls.key=client-key.pem --from-file=ca.crt=bank-ca.pem
apiVersion: v1
kind: Secret
metadata:
  name: bank-client-credential
  namespace: istio-egress  #! DestinationRule credentialName at a gateway resolves in the gateway pods' namespace.
type: Opaque
data:
  tls.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! Client certificate the bank issued to you (or one you issued and registered with them).
  tls.key: LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0t...  #! Its private key.
  ca.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...  #! CA that signed the bank's server certificate. The gateway verifies bank.example.net against it.`
});

/* ------------------------------------------------------------------ */
/* Tenant namespace: shop                                              */
/* ------------------------------------------------------------------ */

O('ns-shop', {
  kind: 'Namespace', name: 'shop', ns: '', owner: 'tenant', req: 'required',
  why: 'Tenant namespace for the storefront and partner API. The injection label puts an Envoy sidecar into every pod, which is what makes mTLS, authorization and egress routing work for them.',
  yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: shop
  labels:
    istio-injection: enabled  #! Without a sidecar the pod is outside the mesh: the gateway cannot reach it under STRICT mTLS, and its outbound calls skip the egress gateway. Revision-based installs use istio.io/rev=<revision> instead.`
});

O('sa-storefront', {
  kind: 'ServiceAccount', name: 'storefront', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'A dedicated identity for storefront. The egress gateway allows calls to payments and the bank only from this principal.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: storefront  #! Principal: cluster.local/ns/shop/sa/storefront. Don't share the default ServiceAccount between apps, or policies can't tell them apart.
  namespace: shop`
});

O('dep-storefront', {
  kind: 'Deployment', name: 'storefront', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'The web application. It receives HTTPS traffic via the ingress gateway, and calls api.payments.example.com and bank.example.net through the egress gateway.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: storefront
  template:
    metadata:
      labels:
        app: storefront  #! Matched by the Service selector and by AuthorizationPolicy selectors.
        version: v1
    spec:
      serviceAccountName: storefront
      containers:
      - name: storefront
        image: registry.example.com/shop/storefront:1.8.2
        ports:
        - containerPort: 8080  #! Plain HTTP inside the pod. The sidecar handles TLS on the way in and out.
        env:
        - name: PAYMENTS_URL
          value: http://api.payments.example.com  #! Plain HTTP on purpose: the egress gateway originates TLS. The bytes are still encrypted between pods by Istio mTLS.
        - name: BANK_URL
          value: http://bank.example.net  #! Same pattern; the egress gateway adds mutual TLS with the bank's client certificate.`
});

O('svc-storefront', {
  kind: 'Service', name: 'storefront', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Gives storefront the in-mesh host storefront.shop.svc.cluster.local that the VirtualService routes to.',
  yaml: `apiVersion: v1
kind: Service
metadata:
  name: storefront  #! Host: storefront.shop.svc.cluster.local
  namespace: shop
spec:
  selector:
    app: storefront
  ports:
  - name: http-web  #! The http- prefix declares HTTP, so Istio can apply HTTP routing, retries and L7 authorization. appProtocol: http does the same.
    port: 8080
    targetPort: 8080`
});

O('vs-storefront', {
  kind: 'VirtualService', name: 'storefront', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Binds shop.example.com on the platform\'s Gateway to the storefront Service. The tenant owns its routes; the platform owns the listener and certificate.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: storefront
  namespace: shop
spec:
  hosts:
  - shop.example.com  #! Matched against the HTTP Host header. Must also be allowed by the Gateway server's hosts (shop/shop.example.com).
  gateways:
  - istio-ingress/shop-gateway  #! namespace/name. A bare shop-gateway would mean shop/shop-gateway, which does not exist, and the route would silently never bind.
  http:
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: storefront.shop.svc.cluster.local  #! Full name of the Kubernetes Service.
        port:
          number: 8080
    timeout: 15s
    retries:
      attempts: 2
      perTryTimeout: 5s
      retryOn: connect-failure,refused-stream,503`
});

O('dr-shop-mtls', {
  kind: 'DestinationRule', name: 'default-mtls', ns: 'shop', owner: 'tenant', req: 'recommended',
  why: 'Tells every client, including the ingress gateway, to use Istio mTLS for Services in shop. Auto mTLS already does this; stating it means a stray DISABLE elsewhere cannot break STRICT.',
  yaml: `apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: default-mtls
  namespace: shop  #! A DestinationRule in the Service's namespace applies to clients in other namespaces too, such as istio-ingress (exportTo defaults to all).
spec:
  host: "*.shop.svc.cluster.local"  #! Every Service in shop.
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL  #! Client presents its mesh certificate and verifies the server's. Matches PeerAuthentication STRICT on the receiving side.`
});

O('pa-shop', {
  kind: 'PeerAuthentication', name: 'default', ns: 'shop', owner: 'tenant', req: 'recommended',
  why: 'Pins STRICT mTLS for shop even if the mesh-wide default changes. Guarantees every request reaching storefront came from a mesh identity that AuthorizationPolicy can check.',
  yaml: `apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: shop
spec:
  mtls:
    mode: STRICT  #! Plaintext connections to shop sidecars are refused.`
});

O('az-shop-deny', {
  kind: 'AuthorizationPolicy', name: 'allow-nothing', ns: 'shop', owner: 'tenant', req: 'recommended',
  why: 'Default deny for the namespace. Every workload in shop rejects requests unless another policy explicitly allows them.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: allow-nothing
  namespace: shop
spec: {}  #! No selector = every workload in shop. No rules = nothing matches. An ALLOW policy that matches nothing denies everything.`
});

O('az-storefront', {
  kind: 'AuthorizationPolicy', name: 'storefront-from-ingress', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Lets the ingress gateway, and only the ingress gateway, reach storefront. Required once the default deny exists.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: storefront-from-ingress
  namespace: shop
spec:
  selector:
    matchLabels:
      app: storefront
  action: ALLOW
  rules:
  - from:
    - source:
        principals:
        - cluster.local/ns/istio-ingress/sa/istio-ingressgateway  #! The gateway's mTLS identity: trust domain / ns / sa. Requires mTLS on this hop.
    to:
    - operation:
        ports: ["8080"]  #! The workload (container) port, not the Service port.
        methods: ["GET", "POST", "HEAD"]`
});

O('sa-partner-api', {
  kind: 'ServiceAccount', name: 'partner-api', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Identity for the partner API.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: partner-api
  namespace: shop`
});

O('dep-partner-api', {
  kind: 'Deployment', name: 'partner-api', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'API used by partners who authenticate with client certificates at the gateway.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: partner-api
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: partner-api
  template:
    metadata:
      labels:
        app: partner-api
    spec:
      serviceAccountName: partner-api
      containers:
      - name: partner-api
        image: registry.example.com/shop/partner-api:2.3.0
        ports:
        - containerPort: 8080`
});

O('svc-partner-api', {
  kind: 'Service', name: 'partner-api', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'In-mesh host partner-api.shop.svc.cluster.local.',
  yaml: `apiVersion: v1
kind: Service
metadata:
  name: partner-api
  namespace: shop
spec:
  selector:
    app: partner-api
  ports:
  - name: http-api
    port: 8080
    targetPort: 8080`
});

O('vs-partner-api', {
  kind: 'VirtualService', name: 'partner-api', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Routes partners.shop.example.com from the mutual TLS Gateway to partner-api. By the time this route runs, the client certificate has already been verified.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: partner-api
  namespace: shop
spec:
  hosts:
  - partners.shop.example.com
  gateways:
  - istio-ingress/partners-gateway
  http:
  - match:
    - uri:
        prefix: /v1/
    route:
    - destination:
        host: partner-api.shop.svc.cluster.local
        port:
          number: 8080
  - directResponse:
      status: 404  #! Anything outside /v1/ never reaches the app.`
});

O('az-partner-api', {
  kind: 'AuthorizationPolicy', name: 'partner-api-from-ingress', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Allows the ingress gateway to call partner-api on /v1/ paths.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: partner-api-from-ingress
  namespace: shop
spec:
  selector:
    matchLabels:
      app: partner-api
  action: ALLOW
  rules:
  - from:
    - source:
        principals:
        - cluster.local/ns/istio-ingress/sa/istio-ingressgateway  #! This is the gateway's mesh identity, not the partner's. The partner's certificate ends at the gateway.
    to:
    - operation:
        ports: ["8080"]
        paths: ["/v1/*"]`
});

O('sc-shop', {
  kind: 'Sidecar', name: 'default', ns: 'shop', owner: 'tenant', req: 'recommended',
  why: 'Limits shop sidecars to their own namespace, istio-system and the egress gateway, and pins REGISTRY_ONLY. If you use a Sidecar, the istio-egress entry is required or the route to the egress gateway has no destination.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default  #! A Sidecar with no workloadSelector applies to every pod in the namespace. Only one such Sidecar per namespace.
  namespace: shop
spec:
  outboundTrafficPolicy:
    mode: REGISTRY_ONLY  #! Same as the mesh-wide setting, pinned for this namespace.
  egress:
  - hosts:
    - "./*"  #! Everything in shop, including the ServiceEntries defined here.
    - "istio-system/*"
    - "istio-egress/*"  #! The egress gateway Service. Leave this out and calls routed to the egress gateway fail with 503 / no healthy upstream.`
});

O('se-payments', {
  kind: 'ServiceEntry', name: 'payments-api', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Registers api.payments.example.com in the mesh. It is exported to istio-egress as well, because the egress gateway has to know the host in order to route to it.',
  yaml: `apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: payments-api
  namespace: shop
spec:
  hosts:
  - api.payments.example.com
  exportTo:
  - "."  #! shop sidecars
  - istio-egress  #! the egress gateway. With exportTo "." alone, the gateway cannot see the host and returns 404 / 503.
  location: MESH_EXTERNAL  #! Outside the mesh: no sidecar there, so no Istio mTLS to it.
  resolution: DNS  #! The egress gateway resolves the name through DNS when it connects.
  ports:
  - number: 80
    name: http
    protocol: HTTP  #! The port the app actually calls, in plain HTTP.
  - number: 443
    name: https
    protocol: HTTPS  #! The real port of the external service. The egress gateway connects here and originates TLS.`
});

O('vs-payments', {
  kind: 'VirtualService', name: 'payments-via-egress', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'One object, two hops. The mesh rule sends the app\'s request from the sidecar to the egress gateway; the gateway rule sends it from the egress gateway to the external host on port 443.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payments-via-egress
  namespace: shop
spec:
  hosts:
  - api.payments.example.com
  gateways:
  - mesh  #! Reserved name: all sidecars that can see this object.
  - istio-egress/egress-payments  #! The egress Gateway object.
  exportTo:
  - "."
  - istio-egress  #! The egress gateway must see this object to use its second rule.
  http:
  - match:
    - gateways:
      - mesh
      port: 80
    route:  #! Hop 1: sidecar to egress gateway.
    - destination:
        host: istio-egressgateway.istio-egress.svc.cluster.local
        subset: payments  #! Subset defined in the egressgateway DestinationRule; it sets ISTIO_MUTUAL and the SNI.
        port:
          number: 80
  - match:
    - gateways:
      - istio-egress/egress-payments
      port: 80
    route:  #! Hop 2: egress gateway to the internet.
    - destination:
        host: api.payments.example.com
        port:
          number: 443  #! The originate-tls DestinationRule in istio-egress adds TLS on this port.`
});

O('dr-shop-egw', {
  kind: 'DestinationRule', name: 'egressgateway', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Applied by shop sidecars when they send to the egress gateway. Each subset wraps the request in Istio mTLS and sets an SNI naming the final destination, so the egress gateway can match the right Gateway server.',
  yaml: `apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: egressgateway
  namespace: shop  #! In the client's namespace. Shop sidecars find it first. One DestinationRule per host per namespace, so all shop subsets live here.
spec:
  host: istio-egressgateway.istio-egress.svc.cluster.local
  exportTo:
  - "."
  subsets:
  - name: payments
    trafficPolicy:
      portLevelSettings:
      - port:
          number: 80
        tls:
          mode: ISTIO_MUTUAL  #! Encrypts the hop and proves the caller is shop/storefront.
          sni: api.payments.example.com  #! Must match a host on the egress Gateway server for port 80.
  - name: bank
    trafficPolicy:
      portLevelSettings:
      - port:
          number: 80
        tls:
          mode: ISTIO_MUTUAL
          sni: bank.example.net`
});

O('se-bank', {
  kind: 'ServiceEntry', name: 'bank-api', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Registers bank.example.net and exports it to the egress gateway.',
  yaml: `apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: bank-api
  namespace: shop
spec:
  hosts:
  - bank.example.net
  exportTo:
  - "."
  - istio-egress
  location: MESH_EXTERNAL
  resolution: DNS
  ports:
  - number: 80
    name: http
    protocol: HTTP  #! What the app calls.
  - number: 443
    name: https
    protocol: HTTPS  #! What the egress gateway connects to, with mutual TLS.`
});

O('vs-bank', {
  kind: 'VirtualService', name: 'bank-via-egress', ns: 'shop', owner: 'tenant', req: 'required',
  why: 'Same two-hop pattern as payments: sidecar to egress gateway, then egress gateway to bank.example.net:443.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: bank-via-egress
  namespace: shop
spec:
  hosts:
  - bank.example.net
  gateways:
  - mesh
  - istio-egress/egress-bank
  exportTo:
  - "."
  - istio-egress
  http:
  - match:
    - gateways:
      - mesh
      port: 80
    route:
    - destination:
        host: istio-egressgateway.istio-egress.svc.cluster.local
        subset: bank
        port:
          number: 80
  - match:
    - gateways:
      - istio-egress/egress-bank
      port: 80
    route:
    - destination:
        host: bank.example.net
        port:
          number: 443`
});

/* ------------------------------------------------------------------ */
/* Tenant namespace: billing                                           */
/* ------------------------------------------------------------------ */

O('ns-billing', {
  kind: 'Namespace', name: 'billing', ns: '', owner: 'tenant', req: 'required',
  why: 'Tenant namespace for the ledger database (TCP ingress), the secure-docs site (TLS passthrough ingress) and the reporter job (TLS passthrough and TCP egress).',
  yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: billing
  labels:
    istio-injection: enabled  #! Sidecars for every pod in billing.`
});

O('pa-billing', {
  kind: 'PeerAuthentication', name: 'default', ns: 'billing', owner: 'tenant', req: 'recommended',
  why: 'STRICT mTLS for billing. TCP and passthrough traffic from the gateway arrive wrapped in Istio mTLS, so the gateway identity is still provable.',
  yaml: `apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: billing
spec:
  mtls:
    mode: STRICT`
});

O('dr-billing-mtls', {
  kind: 'DestinationRule', name: 'default-mtls', ns: 'billing', owner: 'tenant', req: 'recommended',
  why: 'Istio mTLS for every client calling a billing Service, including the ingress gateway.',
  yaml: `apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: default-mtls
  namespace: billing
spec:
  host: "*.billing.svc.cluster.local"
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL  #! For passthrough traffic this wraps the client's own TLS inside Istio mTLS: two layers between gateway and pod.`
});

O('az-billing-deny', {
  kind: 'AuthorizationPolicy', name: 'allow-nothing', ns: 'billing', owner: 'tenant', req: 'recommended',
  why: 'Default deny for billing.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: allow-nothing
  namespace: billing
spec: {}`
});

O('sa-docs', {
  kind: 'ServiceAccount', name: 'secure-docs', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Identity for the secure-docs site.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: secure-docs
  namespace: billing`
});

O('cm-docs', {
  kind: 'ConfigMap', name: 'secure-docs-nginx', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'nginx configuration that makes the app terminate TLS itself, which passthrough depends on.',
  yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: secure-docs-nginx
  namespace: billing
data:
  default.conf: |  #! Mounted at /etc/nginx/conf.d/default.conf
    server {
      listen 8443 ssl;
      server_name docs.billing.example.com;
      ssl_certificate     /etc/nginx/tls/tls.crt;
      ssl_certificate_key /etc/nginx/tls/tls.key;
      ssl_protocols TLSv1.2 TLSv1.3;
      location / { root /usr/share/nginx/html; }
    }`
});

O('dep-docs', {
  kind: 'Deployment', name: 'secure-docs', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Serves docs.billing.example.com and terminates TLS itself with the certificate mounted from its Secret.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-docs
  namespace: billing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: secure-docs
  template:
    metadata:
      labels:
        app: secure-docs
    spec:
      serviceAccountName: secure-docs
      containers:
      - name: nginx
        image: nginxinc/nginx-unprivileged:1.27
        ports:
        - containerPort: 8443  #! TLS port of the app itself.
        volumeMounts:
        - name: tls
          mountPath: /etc/nginx/tls
          readOnly: true
        - name: conf
          mountPath: /etc/nginx/conf.d
      volumes:
      - name: tls
        secret:
          secretName: docs-billing-example-com-tls  #! When cert-manager renews, kubelet updates these files. nginx must reload to use them (a reloader or a periodic nginx -s reload).
      - name: conf
        configMap:
          name: secure-docs-nginx`
});

O('svc-docs', {
  kind: 'Service', name: 'secure-docs', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'In-mesh host for the passthrough route. The tls- port name tells Istio the stream is TLS, so it handles it as opaque bytes.',
  yaml: `apiVersion: v1
kind: Service
metadata:
  name: secure-docs
  namespace: billing
spec:
  selector:
    app: secure-docs
  ports:
  - name: tls-docs  #! tls- prefix (or appProtocol: tls). If Istio treated this as HTTP it would try to parse encrypted bytes and fail.
    port: 443
    targetPort: 8443`
});

O('vs-docs', {
  kind: 'VirtualService', name: 'secure-docs', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Routes by SNI, the only thing visible in a TLS ClientHello, because the gateway does not decrypt.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: secure-docs
  namespace: billing
spec:
  hosts:
  - docs.billing.example.com
  gateways:
  - istio-ingress/docs-gateway
  tls:  #! tls routes, not http: the gateway cannot see paths or headers.
  - match:
    - port: 443
      sniHosts:
      - docs.billing.example.com  #! Must be covered by the VirtualService hosts.
    route:
    - destination:
        host: secure-docs.billing.svc.cluster.local
        port:
          number: 443`
});

O('az-docs', {
  kind: 'AuthorizationPolicy', name: 'secure-docs-from-ingress', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Allows the ingress gateway to reach secure-docs. Only L4 fields work: the sidecar cannot see paths inside the app\'s TLS.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: secure-docs-from-ingress
  namespace: billing
spec:
  selector:
    matchLabels:
      app: secure-docs
  action: ALLOW
  rules:
  - from:
    - source:
        principals:
        - cluster.local/ns/istio-ingress/sa/istio-ingressgateway
    to:
    - operation:
        ports: ["8443"]  #! paths, methods and hosts would never match here, because the traffic is encrypted end to end.`
});

O('sa-ledger', {
  kind: 'ServiceAccount', name: 'ledger-db', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Identity for the ledger database.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: ledger-db
  namespace: billing`
});

O('dep-ledger', {
  kind: 'Deployment', name: 'ledger-db', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'PostgreSQL, exposed to selected external clients over raw TCP.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ledger-db
  namespace: billing
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ledger-db
  template:
    metadata:
      labels:
        app: ledger-db
    spec:
      serviceAccountName: ledger-db
      containers:
      - name: postgres
        image: postgres:16
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: ledger-db-credentials  #! The app's own database Secret. It has nothing to do with routing.
              key: password`
});

O('svc-ledger', {
  kind: 'Service', name: 'ledger-db', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'In-mesh host for the TCP route. The tcp- prefix stops Istio from sniffing for HTTP.',
  yaml: `apiVersion: v1
kind: Service
metadata:
  name: ledger-db
  namespace: billing
spec:
  selector:
    app: ledger-db
  ports:
  - name: tcp-postgres  #! Explicit protocol: Istio proxies bytes and never waits to detect HTTP.
    port: 5432
    targetPort: 5432`
});

O('vs-ledger', {
  kind: 'VirtualService', name: 'ledger-db', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'TCP routes match on port only. There is no hostname in a raw TCP stream, so one gateway port maps to exactly one backend.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: ledger-db
  namespace: billing
spec:
  hosts:
  - "*"  #! TCP carries no hostname. "*" binds to the Gateway server whose hosts are billing/*.
  gateways:
  - istio-ingress/ledger-gateway  #! Because gateways does not include mesh, this "*" route affects only the gateway, never sidecars.
  tcp:
  - match:
    - port: 5432  #! The gateway listener port.
    route:
    - destination:
        host: ledger-db.billing.svc.cluster.local
        port:
          number: 5432`
});

O('az-ledger', {
  kind: 'AuthorizationPolicy', name: 'ledger-from-ingress', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Allows the ingress gateway to open TCP connections to the database.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: ledger-from-ingress
  namespace: billing
spec:
  selector:
    matchLabels:
      app: ledger-db
  action: ALLOW
  rules:
  - from:
    - source:
        principals:
        - cluster.local/ns/istio-ingress/sa/istio-ingressgateway
    to:
    - operation:
        ports: ["5432"]`
});

O('sa-reporter', {
  kind: 'ServiceAccount', name: 'reporter', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Identity for the reporter. The egress gateway allows TCP to backup-db.example.org only from this principal.',
  yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: reporter  #! Principal: cluster.local/ns/billing/sa/reporter
  namespace: billing`
});

O('dep-reporter', {
  kind: 'Deployment', name: 'reporter', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Uploads reports over its own HTTPS to files.example.org and writes backups to an external PostgreSQL over TCP.',
  yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: reporter
  namespace: billing
spec:
  replicas: 1
  selector:
    matchLabels:
      app: reporter
  template:
    metadata:
      labels:
        app: reporter
    spec:
      serviceAccountName: reporter
      containers:
      - name: reporter
        image: registry.example.com/billing/reporter:4.0.1
        env:
        - name: FILES_URL
          value: https://files.example.org  #! The app does TLS itself. Istio never sees inside it.
        - name: BACKUP_DB_HOST
          value: backup-db.example.org  #! Resolved by the sidecar's DNS proxy to a virtual IP, then routed through the egress gateway.
        - name: BACKUP_DB_PORT
          value: "5432"`
});

O('sc-billing', {
  kind: 'Sidecar', name: 'default', ns: 'billing', owner: 'tenant', req: 'recommended',
  why: 'Restricts billing sidecars and keeps the egress gateway reachable.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default
  namespace: billing
spec:
  outboundTrafficPolicy:
    mode: REGISTRY_ONLY
  egress:
  - hosts:
    - "./*"
    - "istio-system/*"
    - "istio-egress/*"  #! Required for any route that targets the egress gateway.`
});

O('se-files', {
  kind: 'ServiceEntry', name: 'files-api', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Registers files.example.org with protocol TLS, so proxies route it by SNI without decrypting.',
  yaml: `apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: files-api
  namespace: billing
spec:
  hosts:
  - files.example.org
  exportTo:
  - "."
  - istio-egress
  location: MESH_EXTERNAL
  resolution: DNS
  ports:
  - number: 443
    name: tls
    protocol: TLS  #! Opaque TLS. Routing uses the SNI from the app's ClientHello.`
});

O('vs-files', {
  kind: 'VirtualService', name: 'files-via-egress', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Two tls rules, both matching on SNI: one steers the sidecar to the egress gateway, the other steers the egress gateway to files.example.org.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: files-via-egress
  namespace: billing
spec:
  hosts:
  - files.example.org
  gateways:
  - mesh
  - istio-egress/egress-files
  exportTo:
  - "."
  - istio-egress
  tls:
  - match:
    - gateways:
      - mesh
      port: 443
      sniHosts:
      - files.example.org
    route:
    - destination:
        host: istio-egressgateway.istio-egress.svc.cluster.local
        subset: files
        port:
          number: 443
  - match:
    - gateways:
      - istio-egress/egress-files
      port: 443
      sniHosts:
      - files.example.org
    route:
    - destination:
        host: files.example.org
        port:
          number: 443`
});

O('se-backup', {
  kind: 'ServiceEntry', name: 'backup-db', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Registers an external PostgreSQL. For TCP, the sidecar needs an IP to match on; DNS auto-allocation (or explicit addresses) provides it.',
  yaml: `apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: backup-db
  namespace: billing
spec:
  hosts:
  - backup-db.example.org
  exportTo:
  - "."
  - istio-egress
  location: MESH_EXTERNAL
  resolution: DNS
  ports:
  - number: 5432
    name: tcp-postgres
    protocol: TCP  #! No hostname inside TCP. Without an address (auto-allocated or listed under addresses), every TCP ServiceEntry on 5432 would share one listener and collide.`
});

O('vs-backup', {
  kind: 'VirtualService', name: 'backup-db-via-egress', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'tcp rules: port 5432 from sidecars goes to the egress gateway on 5443 inside mTLS; port 5443 at the egress gateway goes on to the database on 5432.',
  yaml: `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: backup-db-via-egress
  namespace: billing
spec:
  hosts:
  - backup-db.example.org
  gateways:
  - mesh
  - istio-egress/egress-backup-db
  exportTo:
  - "."
  - istio-egress
  tcp:
  - match:
    - gateways:
      - mesh
      port: 5432
    route:
    - destination:
        host: istio-egressgateway.istio-egress.svc.cluster.local
        subset: backup-db
        port:
          number: 5443  #! Port on the egress gateway Service, listed in values-egress.yaml.
  - match:
    - gateways:
      - istio-egress/egress-backup-db
      port: 5443
    route:
    - destination:
        host: backup-db.example.org
        port:
          number: 5432`
});

O('dr-billing-egw', {
  kind: 'DestinationRule', name: 'egressgateway', ns: 'billing', owner: 'tenant', req: 'required',
  why: 'Subsets used by billing sidecars when sending to the egress gateway. backup-db gets Istio mTLS with an SNI; files is left as the app\'s own TLS.',
  yaml: `apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: egressgateway
  namespace: billing
spec:
  host: istio-egressgateway.istio-egress.svc.cluster.local
  exportTo:
  - "."
  subsets:
  - name: files  #! No tls block: the bytes are already the app's TLS, and the egress Gateway server for 443 is PASSTHROUGH, which expects that TLS untouched.
  - name: backup-db
    trafficPolicy:
      portLevelSettings:
      - port:
          number: 5443
        tls:
          mode: ISTIO_MUTUAL  #! Encrypts the plain TCP and carries reporter's identity to the egress gateway.
          sni: backup-db.example.org  #! Matches the host of the egress Gateway server on 5443; also checked by the egress AuthorizationPolicy.`
});

/* ------------------------------------------------------------------ */
/* Ingress Gateways (istio-ingress)                                    */
/* ------------------------------------------------------------------ */

O('gw-shop', {
  kind: 'Gateway', name: 'shop-gateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Opens 443 for shop.example.com with TLS terminated at the gateway, and 80 to redirect plain HTTP to HTTPS. The shop/ prefix on hosts means only VirtualServices in the shop namespace can bind to it.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: shop-gateway
  namespace: istio-ingress  #! Kept next to the gateway pods. (By default the selector matches gateway pods in any namespace, but credentialName always resolves in the pods' namespace.)
spec:
  selector:
    istio: ingressgateway  #! Which Envoy pods get these listeners. Must match the gateway Deployment's pod labels.
  servers:
  - port:
      number: 443  #! Must be exposed by the istio-ingressgateway Service.
      name: https-shop
      protocol: HTTPS  #! TLS terminated here, HTTP inside.
    hosts:
    - shop/shop.example.com  #! <namespace>/<host>: only VirtualServices in shop may bind this host. "*/shop.example.com" would allow any namespace.
    tls:
      mode: SIMPLE  #! Standard one-way TLS: the gateway presents a certificate; the client is not asked for one.
      credentialName: shop-example-com-tls  #! Secret in istio-ingress with tls.crt and tls.key. Served by istiod over SDS.
      minProtocolVersion: TLSV1_2
  - port:
      number: 80
      name: http-shop
      protocol: HTTP
    hosts:
    - shop/shop.example.com
    tls:
      httpsRedirect: true  #! Optional. Answers plain HTTP with a 301 to https://. No VirtualService needed for this.`
});

O('gw-partners', {
  kind: 'Gateway', name: 'partners-gateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Mutual TLS: the gateway presents its certificate and also demands one from the client, verifying it against the partner CA. Clients without a valid certificate fail the handshake before any HTTP is exchanged.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: partners-gateway
  namespace: istio-ingress
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      name: https-partners
      protocol: HTTPS
    hosts:
    - shop/partners.shop.example.com
    tls:
      mode: MUTUAL  #! Requires a client certificate that chains to the trusted CA.
      credentialName: partners-shop-example-com-tls  #! Server cert/key from this Secret. Client CA from its ca.crt key, or from the Secret partners-shop-example-com-tls-cacert.
      minProtocolVersion: TLSV1_2
      subjectAltNames:
      - acme-logistics.partners.shop.example.com  #! Optional. Accept only client certificates with one of these SANs. Without it, any certificate signed by the partner CA is accepted.
# To tell the app which partner called, the gateway can pass the client certificate details
# in the x-forwarded-client-cert header. That is set by gatewayTopology.forwardClientCertDetails
# in the gateway's proxy config (meshConfig.defaultConfig or the proxy.istio.io/config pod annotation).`
});

O('gw-docs', {
  kind: 'Gateway', name: 'docs-gateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'TLS passthrough: the gateway reads the SNI from the ClientHello and forwards the encrypted stream untouched. No credentialName, because the gateway holds no certificate for this host.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: docs-gateway
  namespace: istio-ingress
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      name: tls-docs
      protocol: TLS  #! TLS, not HTTPS: the gateway only looks at the handshake, never at HTTP.
    hosts:
    - billing/docs.billing.example.com
    tls:
      mode: PASSTHROUGH  #! Forward by SNI without decrypting. The backend must terminate TLS itself.`
});

O('gw-ledger', {
  kind: 'Gateway', name: 'ledger-gateway', ns: 'istio-ingress', owner: 'platform', req: 'required',
  why: 'Opens a raw TCP listener on 5432. Anything arriving on that port goes to whichever TCP route is bound to it.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: ledger-gateway
  namespace: istio-ingress
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 5432  #! Also add 5432 to the gateway Service, and to any cloud firewall in front of it.
      name: tcp-ledger
      protocol: TCP  #! Bytes in, bytes out. No TLS handling and no hostnames.
    hosts:
    - billing/*  #! Required field. With TCP it only limits which namespace's VirtualServices may bind.`
});

O('az-ledger-ip', {
  kind: 'AuthorizationPolicy', name: 'ledger-ip-allowlist', ns: 'istio-ingress', owner: 'platform', req: 'recommended',
  why: 'A database on the internet should not accept connections from everyone. Enforced at the gateway, before traffic enters the mesh.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: ledger-ip-allowlist
  namespace: istio-ingress
spec:
  selector:
    matchLabels:
      istio: ingressgateway
  action: DENY
  rules:
  - to:
    - operation:
        ports: ["5432"]  #! Only the TCP listener. HTTPS traffic is unaffected.
    from:
    - source:
        notRemoteIpBlocks:
        - 203.0.113.0/24  #! The client network allowed in. remoteIpBlocks needs the real client IP: externalTrafficPolicy Local on the Service.`
});

/* ------------------------------------------------------------------ */
/* Egress Gateways and policies (istio-egress)                         */
/* ------------------------------------------------------------------ */

O('gw-eg-payments', {
  kind: 'Gateway', name: 'egress-payments', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Listener on the egress gateway for traffic to api.payments.example.com. ISTIO_MUTUAL means it terminates the Istio mTLS from the sidecar, so it sees plain HTTP and the caller\'s identity.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: egress-payments
  namespace: istio-egress
spec:
  selector:
    istio: egressgateway
  servers:
  - port:
      number: 80
      name: https-payments
      protocol: HTTPS  #! The hop is encrypted (HTTPS) even though the app spoke plain HTTP.
    hosts:
    - api.payments.example.com  #! Matched against the SNI the sidecar sets in its DestinationRule subset.
    tls:
      mode: ISTIO_MUTUAL  #! Uses the mesh's own certificates; no credentialName.`
});

O('dr-orig-payments', {
  kind: 'DestinationRule', name: 'originate-tls-payments', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Applied by the egress gateway when it connects to api.payments.example.com:443. This is where TLS is originated, and where the server certificate is verified.',
  yaml: `apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: originate-tls-payments
  namespace: istio-egress  #! The client is the egress gateway, so the rule lives in its namespace.
spec:
  host: api.payments.example.com
  exportTo:
  - "."  #! Only the egress gateway. Sidecars must not originate TLS themselves.
  trafficPolicy:
    portLevelSettings:
    - port:
        number: 443
      tls:
        mode: SIMPLE  #! One-way TLS from the gateway to the external server.
        sni: api.payments.example.com  #! SNI in the ClientHello; most external servers require it.
        subjectAltNames:
        - api.payments.example.com  #! Hostname check on the server certificate. The certificate is verified against the system CA bundle unless you set caCertificates or credentialName.`
});

O('gw-eg-bank', {
  kind: 'Gateway', name: 'egress-bank', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Listener on the egress gateway for traffic to bank.example.net, terminating the sidecar\'s Istio mTLS.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: egress-bank
  namespace: istio-egress
spec:
  selector:
    istio: egressgateway
  servers:
  - port:
      number: 80
      name: https-bank
      protocol: HTTPS
    hosts:
    - bank.example.net  #! Shares port 80 with egress-payments; SNI separates them.
    tls:
      mode: ISTIO_MUTUAL`
});

O('dr-orig-bank', {
  kind: 'DestinationRule', name: 'originate-mtls-bank', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Makes the egress gateway present a client certificate to the bank. The application never handles the bank\'s key material.',
  yaml: `apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: originate-mtls-bank
  namespace: istio-egress
spec:
  host: bank.example.net
  exportTo:
  - "."
  trafficPolicy:
    portLevelSettings:
    - port:
        number: 443
      tls:
        mode: MUTUAL  #! Gateway presents a client certificate and verifies the server.
        credentialName: bank-client-credential  #! Secret in istio-egress with tls.crt, tls.key and ca.crt. credentialName only works for DestinationRules applied at gateways, not sidecars.
        sni: bank.example.net
        subjectAltNames:
        - bank.example.net`
});

O('gw-eg-files', {
  kind: 'Gateway', name: 'egress-files', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Passthrough listener: the egress gateway routes by SNI and forwards the app\'s TLS unchanged.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: egress-files
  namespace: istio-egress
spec:
  selector:
    istio: egressgateway
  servers:
  - port:
      number: 443
      name: tls-files
      protocol: TLS
    hosts:
    - files.example.org  #! Matched against the SNI the app put in its own ClientHello.
    tls:
      mode: PASSTHROUGH  #! No decryption. The gateway cannot see HTTP or a caller identity on this hop.`
});

O('gw-eg-backup', {
  kind: 'Gateway', name: 'egress-backup-db', ns: 'istio-egress', owner: 'platform', req: 'required',
  why: 'Receives the reporter\'s TCP stream inside Istio mTLS on 5443, terminates the mTLS, and hands plain TCP to the route that leads to backup-db.example.org.',
  yaml: `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: egress-backup-db
  namespace: istio-egress
spec:
  selector:
    istio: egressgateway
  servers:
  - port:
      number: 5443
      name: tls-backup-db
      protocol: TLS  #! TLS, terminated here; the payload inside is raw TCP, routed by the VirtualService tcp rules.
    hosts:
    - backup-db.example.org  #! Matched against the SNI set by billing's DestinationRule subset.
    tls:
      mode: ISTIO_MUTUAL`
});

O('az-egress', {
  kind: 'AuthorizationPolicy', name: 'egress-allowlist', ns: 'istio-egress', owner: 'platform', req: 'recommended',
  why: 'Decides which workloads may use which external destination. Without it, any pod that can reach the egress gateway can use any route configured on it.',
  yaml: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: egress-allowlist
  namespace: istio-egress
spec:
  selector:
    matchLabels:
      istio: egressgateway
  action: ALLOW  #! Once an ALLOW policy selects the gateway, anything that matches no rule is denied.
  rules:
  - from:
    - source:
        principals:
        - cluster.local/ns/shop/sa/storefront  #! Known because the hop is ISTIO_MUTUAL.
    to:
    - operation:
        hosts:
        - api.payments.example.com
        - bank.example.net  #! HTTP Host header, readable because the gateway terminated the mTLS and sees HTTP.
  - from:
    - source:
        principals:
        - cluster.local/ns/billing/sa/reporter
    to:
    - operation:
        ports: ["5443"]
    when:
    - key: connection.sni
      values:
      - backup-db.example.org  #! TCP has no Host header; the SNI from the mTLS hop names the destination.
  - to:
    - operation:
        ports: ["443"]
    when:
    - key: connection.sni
      values:
      - files.example.org  #! Passthrough carries the app's TLS, not Istio mTLS, so there is no principal to check. Only SNI is available.`
});

/* ------------------------------------------------------------------ */
/* Lockdown                                                            */
/* ------------------------------------------------------------------ */

O('np-shop', {
  kind: 'NetworkPolicy', name: 'egress-inside-cluster-only', ns: 'shop', owner: 'tenant', req: 'recommended',
  why: 'Istio settings live in the pod, and a container with enough privileges can step around its sidecar. A NetworkPolicy is enforced by the CNI on the node, so pods in shop cannot open connections to the internet even if they bypass Envoy. Only the egress gateway pods can.',
  yaml: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: egress-inside-cluster-only
  namespace: shop
spec:
  podSelector: {}  #! Every pod in shop.
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector: {}  #! Any pod in any namespace: istiod, kube-dns, the egress gateway, other tenants. External IPs are not pods, so direct internet traffic is dropped. Requires a CNI that enforces NetworkPolicy.`
});

O('np-billing', {
  kind: 'NetworkPolicy', name: 'egress-inside-cluster-only', ns: 'billing', owner: 'tenant', req: 'recommended',
  why: 'Same protection for billing.',
  yaml: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: egress-inside-cluster-only
  namespace: billing
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector: {}`
});

/* ------------------------------------------------------------------ */
/* Gateway API comparison                                              */
/* ------------------------------------------------------------------ */

O('gapi-gw', {
  kind: 'GatewayAPIGateway', name: 'public', ns: 'istio-ingress', owner: 'platform', req: 'optional',
  why: 'The Gateway API equivalent of shop-gateway plus the gateway Deployment and Service, which Istio creates for you.',
  yaml: `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: public
  namespace: istio-ingress
spec:
  gatewayClassName: istio  #! Istio deploys and manages a Deployment and Service named public-istio for this Gateway. No istio/gateway Helm release needed.
  listeners:
  - name: https-shop
    hostname: shop.example.com
    port: 443
    protocol: HTTPS
    tls:
      mode: Terminate  #! Equivalent of tls.mode SIMPLE. Passthrough uses protocol TLS, mode Passthrough and a TLSRoute.
      certificateRefs:
      - kind: Secret
        name: shop-example-com-tls  #! Same namespace as the Gateway, so no ReferenceGrant is needed.
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            kubernetes.io/metadata.name: shop  #! Replaces the shop/ host prefix: only routes from shop may attach.`
});

O('gapi-route', {
  kind: 'HTTPRoute', name: 'storefront', ns: 'shop', owner: 'tenant', req: 'optional',
  why: 'The Gateway API equivalent of the storefront VirtualService.',
  yaml: `apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: storefront
  namespace: shop
spec:
  parentRefs:
  - name: public
    namespace: istio-ingress  #! Like gateways: istio-ingress/shop-gateway.
    sectionName: https-shop
  hostnames:
  - shop.example.com
  rules:
  - backendRefs:
    - name: storefront
      port: 8080`
});
