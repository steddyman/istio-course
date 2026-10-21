/* Istio Ingress & Egress course: scenarios.
   lanes:  namespaces shown as columns in the relationship map ('' = cluster-scoped).
   objects: object ids from objects.js, top to bottom within their lane.
   edges:  [from, to, label]  "from references / acts on to".
   flow:   the wire view. hops[i] joins nodes[i] and nodes[i+1]; enc is plain | tls | mtls | istio. */

window.SC = {};

SC['foundation'] = {
  lanes: ['', 'istio-system', 'istio-ingress', 'istio-egress'],
  objects: ['ns-istio-system', 'ns-istio-ingress', 'ns-istio-egress',
    'helm-istiod', 'pa-mesh',
    'helm-ingress', 'igw-sa', 'igw-deploy', 'igw-svc', 'igw-role', 'igw-rb', 'igw-pdb',
    'helm-egress', 'egw-sa', 'egw-deploy', 'egw-svc', 'egw-role', 'egw-rb'],
  edges: [
    ['helm-ingress', 'igw-deploy', 'generates'],
    ['helm-ingress', 'igw-svc', 'service.ports'],
    ['igw-svc', 'igw-deploy', 'selector istio=ingressgateway'],
    ['igw-deploy', 'igw-sa', 'serviceAccountName'],
    ['igw-rb', 'igw-role', 'roleRef'],
    ['igw-rb', 'igw-sa', 'subjects'],
    ['igw-pdb', 'igw-deploy', 'selector'],
    ['helm-egress', 'egw-deploy', 'generates'],
    ['helm-egress', 'egw-svc', 'service.ports'],
    ['egw-svc', 'egw-deploy', 'selector istio=egressgateway'],
    ['egw-deploy', 'egw-sa', 'serviceAccountName'],
    ['egw-rb', 'egw-role', 'roleRef'],
    ['egw-rb', 'egw-sa', 'subjects'],
    ['pa-mesh', 'igw-deploy', 'mesh-wide (not gateway listeners)'],
    ['ns-istio-ingress', 'igw-deploy', 'injection'],
    ['ns-istio-egress', 'egw-deploy', 'injection'],
    ['helm-istiod', 'egw-deploy', 'pushes config (xDS)'],
    ['helm-istiod', 'igw-deploy', 'pushes config (xDS)']
  ]
};

SC['certs'] = {
  lanes: ['', 'cert-manager', 'istio-ingress', 'billing', 'istio-egress'],
  objects: ['ci-letsencrypt', 'ci-selfsigned', 'ci-partner-ca',
    'cert-partner-root', 'sec-partner-root', 'cert-partner-client',
    'cert-shop', 'sec-shop-tls', 'cert-partners', 'sec-partners-tls', 'sec-partners-cacert', 'gw-shop', 'gw-partners',
    'cert-docs', 'sec-docs-tls', 'dep-docs',
    'sec-bank-client', 'dr-orig-bank'],
  edges: [
    ['cert-partner-root', 'ci-selfsigned', 'issuerRef'],
    ['cert-partner-root', 'sec-partner-root', 'writes secretName'],
    ['ci-partner-ca', 'sec-partner-root', 'ca.secretName'],
    ['cert-partner-client', 'ci-partner-ca', 'issuerRef'],
    ['cert-shop', 'ci-letsencrypt', 'issuerRef'],
    ['cert-shop', 'sec-shop-tls', 'writes secretName'],
    ['cert-partners', 'ci-letsencrypt', 'issuerRef'],
    ['cert-partners', 'sec-partners-tls', 'writes secretName'],
    ['sec-partners-cacert', 'sec-partner-root', 'copy of public ca.crt'],
    ['gw-shop', 'sec-shop-tls', 'credentialName'],
    ['gw-partners', 'sec-partners-tls', 'credentialName'],
    ['gw-partners', 'sec-partners-cacert', 'credentialName + -cacert'],
    ['cert-docs', 'ci-letsencrypt', 'issuerRef'],
    ['cert-docs', 'sec-docs-tls', 'writes secretName'],
    ['dep-docs', 'sec-docs-tls', 'volume mount'],
    ['dr-orig-bank', 'sec-bank-client', 'credentialName']
  ]
};

/* ---------------------------- Ingress ----------------------------- */

SC['in-https'] = {
  lanes: ['', 'istio-ingress', 'shop'],
  objects: ['ci-letsencrypt', 'ns-shop',
    'cert-shop', 'sec-shop-tls', 'gw-shop', 'igw-svc', 'igw-deploy', 'igw-sa', 'igw-role', 'igw-rb',
    'vs-storefront', 'svc-storefront', 'dep-storefront', 'sa-storefront', 'dr-shop-mtls', 'pa-shop', 'az-shop-deny', 'az-storefront'],
  focus: 'gw-shop',
  edges: [
    ['cert-shop', 'ci-letsencrypt', 'issuerRef'],
    ['cert-shop', 'sec-shop-tls', 'writes secretName'],
    ['gw-shop', 'sec-shop-tls', 'credentialName'],
    ['gw-shop', 'igw-deploy', 'selector istio=ingressgateway'],
    ['igw-svc', 'igw-deploy', 'selector'],
    ['igw-deploy', 'igw-sa', 'serviceAccountName'],
    ['igw-rb', 'igw-role', 'roleRef'],
    ['igw-rb', 'igw-sa', 'subjects'],
    ['vs-storefront', 'gw-shop', 'gateways: istio-ingress/shop-gateway'],
    ['vs-storefront', 'svc-storefront', 'destination.host'],
    ['svc-storefront', 'dep-storefront', 'selector app=storefront'],
    ['dep-storefront', 'sa-storefront', 'serviceAccountName'],
    ['dr-shop-mtls', 'svc-storefront', 'host *.shop.svc'],
    ['pa-shop', 'dep-storefront', 'STRICT for namespace'],
    ['az-shop-deny', 'dep-storefront', 'deny by default'],
    ['az-storefront', 'dep-storefront', 'selector'],
    ['az-storefront', 'igw-sa', 'principals'],
    ['ns-shop', 'dep-storefront', 'injects sidecar']
  ],
  flow: {
    nodes: [
      { label: 'Browser', sub: 'internet', zone: 'ext' },
      { label: 'Cloud LB', sub: 'Service :443', zone: 'ing' },
      { label: 'Ingress gateway', sub: 'istio-ingress', zone: 'ing' },
      { label: 'Sidecar', sub: 'shop / storefront', zone: 'ten' },
      { label: 'storefront', sub: 'app :8080', zone: 'ten' }
    ],
    hops: [
      { enc: 'tls', label: 'TLS · SNI shop.example.com' },
      { enc: 'tls', label: 'same TLS stream (L4)' },
      { enc: 'istio', label: 'Istio mTLS · gateway identity' },
      { enc: 'plain', label: 'plain HTTP on localhost' }
    ],
    steps: [
      { node: 0, title: 'Client opens TLS', text: 'DNS for shop.example.com points at the load balancer. The browser starts a TLS handshake whose ClientHello carries SNI shop.example.com. A request to port 80 instead gets a 301 to HTTPS from the httpsRedirect server.', objs: ['igw-svc'] },
      { node: 1, title: 'Load balancer forwards TCP', text: 'The cloud load balancer created for the LoadBalancer Service passes the TCP connection to a gateway pod on 443. It does not decrypt anything.', objs: ['igw-svc', 'igw-deploy'] },
      { node: 2, title: 'Gateway terminates TLS', text: 'The 443 listener comes from the shop-gateway server. Envoy matches the SNI to the server host, presents the certificate from Secret shop-example-com-tls (sent by istiod over SDS after checking the Role), and decrypts. It now sees HTTP: Host shop.example.com, path /. The bound VirtualService routes it to storefront.shop.svc.cluster.local:8080.', objs: ['gw-shop', 'sec-shop-tls', 'cert-shop', 'igw-role', 'vs-storefront'] },
      { node: 3, title: 'Sidecar checks identity', text: 'The gateway connects to a storefront pod with Istio mTLS (DestinationRule ISTIO_MUTUAL), presenting its SPIFFE identity. The storefront sidecar accepts only mTLS (PeerAuthentication STRICT), then runs authorization: the default deny would block it, but storefront-from-ingress allows the gateway principal on port 8080.', objs: ['dr-shop-mtls', 'pa-shop', 'az-shop-deny', 'az-storefront'] },
      { node: 4, title: 'App receives plain HTTP', text: 'The sidecar forwards the request over localhost to the app on 8080. The app never handles certificates.', objs: ['svc-storefront', 'dep-storefront'] }
    ]
  },
  test: `# Find the gateway address
export INGRESS_IP=$(kubectl -n istio-ingress get svc istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Request through the gateway; --resolve lets you test before DNS exists
curl -v --resolve shop.example.com:443:$INGRESS_IP https://shop.example.com/

# Is the certificate loaded on the gateway?
istioctl proxy-config secret deploy/istio-ingressgateway -n istio-ingress

# Did the VirtualService bind? Look for shop.example.com in the 443 route table
istioctl proxy-config routes deploy/istio-ingressgateway -n istio-ingress

# Static checks across all namespaces
istioctl analyze -A`,
  gotchas: [
    'The Secret must be in istio-ingress (the gateway pods\' namespace), not in shop.',
    'gateways: needs the namespace prefix, istio-ingress/shop-gateway. Without it the route never binds and clients get 404 with response flag NR.',
    'The VirtualService host must fall inside the Gateway server hosts, and the namespace part of shop/shop.example.com must be the VirtualService\'s namespace.',
    'Missing Role or RoleBinding for the gateway ServiceAccount: istiod refuses the SDS request, the gateway has no certificate, and the handshake fails.',
    'Two Gateway servers with the same host on the same port conflict. Istio keeps one and reports the other in istioctl analyze.'
  ]
};

SC['in-mtls'] = {
  lanes: ['', 'cert-manager', 'istio-ingress', 'shop'],
  objects: ['ci-selfsigned', 'ci-partner-ca', 'ci-letsencrypt',
    'cert-partner-root', 'sec-partner-root', 'cert-partner-client',
    'cert-partners', 'sec-partners-tls', 'sec-partners-cacert', 'gw-partners', 'igw-deploy', 'igw-sa', 'igw-role', 'igw-rb',
    'vs-partner-api', 'svc-partner-api', 'dep-partner-api', 'sa-partner-api', 'az-partner-api', 'dr-shop-mtls', 'pa-shop'],
  focus: 'gw-partners',
  edges: [
    ['cert-partner-root', 'ci-selfsigned', 'issuerRef'],
    ['cert-partner-root', 'sec-partner-root', 'writes secretName'],
    ['ci-partner-ca', 'sec-partner-root', 'ca.secretName'],
    ['cert-partner-client', 'ci-partner-ca', 'issuerRef'],
    ['sec-partners-cacert', 'sec-partner-root', 'copy of public ca.crt'],
    ['cert-partners', 'ci-letsencrypt', 'issuerRef'],
    ['cert-partners', 'sec-partners-tls', 'writes secretName'],
    ['gw-partners', 'sec-partners-tls', 'credentialName'],
    ['gw-partners', 'sec-partners-cacert', 'credentialName + -cacert'],
    ['gw-partners', 'igw-deploy', 'selector'],
    ['igw-deploy', 'igw-sa', 'serviceAccountName'],
    ['igw-rb', 'igw-role', 'roleRef'],
    ['igw-rb', 'igw-sa', 'subjects'],
    ['vs-partner-api', 'gw-partners', 'gateways'],
    ['vs-partner-api', 'svc-partner-api', 'destination.host'],
    ['svc-partner-api', 'dep-partner-api', 'selector'],
    ['dep-partner-api', 'sa-partner-api', 'serviceAccountName'],
    ['az-partner-api', 'dep-partner-api', 'selector'],
    ['az-partner-api', 'igw-sa', 'principals'],
    ['dr-shop-mtls', 'svc-partner-api', 'ISTIO_MUTUAL'],
    ['pa-shop', 'dep-partner-api', 'STRICT']
  ],
  flow: {
    nodes: [
      { label: 'Partner system', sub: 'holds client cert', zone: 'ext' },
      { label: 'Cloud LB', sub: 'Service :443', zone: 'ing' },
      { label: 'Ingress gateway', sub: 'MUTUAL', zone: 'ing' },
      { label: 'Sidecar', sub: 'shop / partner-api', zone: 'ten' },
      { label: 'partner-api', sub: 'app :8080', zone: 'ten' }
    ],
    hops: [
      { enc: 'mtls', label: 'mTLS · both sides show certs' },
      { enc: 'mtls', label: 'same stream (L4)' },
      { enc: 'istio', label: 'Istio mTLS · gateway identity' },
      { enc: 'plain', label: 'plain HTTP on localhost' }
    ],
    steps: [
      { node: 0, title: 'Partner connects with a certificate', text: 'The partner system has tls.crt and tls.key issued by the partner CA (client-acme-logistics). It sends SNI partners.shop.example.com and is ready to present its certificate when asked.', objs: ['cert-partner-client'] },
      { node: 1, title: 'Load balancer forwards TCP', text: 'Same as plain HTTPS: L4 only.', objs: ['igw-svc'] },
      { node: 2, title: 'Gateway verifies both directions', text: 'The partners-gateway server (mode MUTUAL) presents the public server certificate and sends a CertificateRequest. The client\'s certificate must chain to ca.crt from partners-shop-example-com-tls-cacert and carry an allowed SAN. A missing or untrusted certificate fails the handshake; no HTTP is ever read. On success, the VirtualService routes /v1/ to partner-api.', objs: ['gw-partners', 'sec-partners-tls', 'sec-partners-cacert', 'vs-partner-api'] },
      { node: 3, title: 'New mTLS hop inside the mesh', text: 'The partner\'s certificate ends at the gateway. Inside the mesh the gateway uses its own identity, so the sidecar\'s AuthorizationPolicy allows the gateway principal, not the partner. Partner details can travel in the x-forwarded-client-cert header if the gateway is set to forward them.', objs: ['dr-shop-mtls', 'pa-shop', 'az-partner-api'] },
      { node: 4, title: 'App receives plain HTTP', text: 'partner-api handles an ordinary HTTP request.', objs: ['dep-partner-api'] }
    ]
  },
  test: `# With the client certificate: expect 200
curl --resolve partners.shop.example.com:443:$INGRESS_IP --cert client.crt --key client.key https://partners.shop.example.com/v1/health

# Without it: expect a TLS alert (certificate required), not an HTTP status
curl -v --resolve partners.shop.example.com:443:$INGRESS_IP https://partners.shop.example.com/v1/health

# Check the gateway loaded the client CA (look for ROOTCA on the -cacert entry)
istioctl proxy-config secret deploy/istio-ingressgateway -n istio-ingress

# Inspect what the server asks for
openssl s_client -connect $INGRESS_IP:443 -servername partners.shop.example.com -showcerts </dev/null`,
  gotchas: [
    'MUTUAL needs two things from Secrets: the server key pair and the client CA. A missing CA makes the listener fail to load.',
    'The CA file name is fixed: ca.crt, in the main Secret or in <credentialName>-cacert.',
    'The ca.crt that cert-manager writes for a private CA is the CA of the server certificate. Only reuse it for clients if the same CA really issues client certificates.',
    'Never copy the CA private key (tls.key of partner-root-ca) into istio-ingress. Only the public ca.crt.',
    'Without subjectAltNames, any certificate the partner CA ever issued is accepted. Use one SAN per partner, and revoke by rotating or removing from the list.'
  ]
};

SC['in-pass'] = {
  lanes: ['', 'istio-ingress', 'billing'],
  objects: ['ci-letsencrypt', 'ns-billing',
    'gw-docs', 'igw-svc', 'igw-deploy', 'igw-sa',
    'vs-docs', 'svc-docs', 'dep-docs', 'sa-docs', 'cm-docs', 'cert-docs', 'sec-docs-tls', 'dr-billing-mtls', 'pa-billing', 'az-billing-deny', 'az-docs'],
  focus: 'gw-docs',
  edges: [
    ['gw-docs', 'igw-deploy', 'selector'],
    ['igw-svc', 'igw-deploy', 'selector'],
    ['igw-deploy', 'igw-sa', 'serviceAccountName'],
    ['vs-docs', 'gw-docs', 'gateways + sniHosts'],
    ['vs-docs', 'svc-docs', 'destination.host'],
    ['svc-docs', 'dep-docs', 'selector'],
    ['dep-docs', 'sa-docs', 'serviceAccountName'],
    ['dep-docs', 'cm-docs', 'nginx config'],
    ['dep-docs', 'sec-docs-tls', 'volume mount'],
    ['cert-docs', 'sec-docs-tls', 'writes secretName'],
    ['cert-docs', 'ci-letsencrypt', 'issuerRef'],
    ['dr-billing-mtls', 'svc-docs', 'ISTIO_MUTUAL'],
    ['pa-billing', 'dep-docs', 'STRICT'],
    ['az-billing-deny', 'dep-docs', 'deny by default'],
    ['az-docs', 'dep-docs', 'selector'],
    ['az-docs', 'igw-sa', 'principals'],
    ['ns-billing', 'dep-docs', 'injects sidecar']
  ],
  flow: {
    nodes: [
      { label: 'Client', sub: 'internet', zone: 'ext' },
      { label: 'Cloud LB', sub: 'Service :443', zone: 'ing' },
      { label: 'Ingress gateway', sub: 'reads SNI only', zone: 'ing' },
      { label: 'Sidecar', sub: 'billing / secure-docs', zone: 'ten' },
      { label: 'secure-docs', sub: 'nginx :8443 TLS', zone: 'ten' }
    ],
    hops: [
      { enc: 'tls', label: 'TLS to the app · SNI docs…' },
      { enc: 'tls', label: 'same TLS stream' },
      { enc: 'istio', label: 'Istio mTLS around client TLS' },
      { enc: 'tls', label: 'client TLS, still encrypted' }
    ],
    steps: [
      { node: 0, title: 'Client opens TLS', text: 'The client sends a ClientHello with SNI docs.billing.example.com. Its TLS session will end at the app, not at the gateway.', objs: [] },
      { node: 1, title: 'Load balancer forwards TCP', text: 'L4 only, as always.', objs: ['igw-svc'] },
      { node: 2, title: 'Gateway peeks at SNI', text: 'The docs-gateway server (protocol TLS, mode PASSTHROUGH) reads only the unencrypted SNI from the ClientHello. The VirtualService tls rule with sniHosts docs.billing.example.com picks secure-docs:443. The gateway holds no certificate for this host and cannot see paths or headers.', objs: ['gw-docs', 'vs-docs'] },
      { node: 3, title: 'Wrapped in Istio mTLS', text: 'The gateway sends the client\'s encrypted bytes to the pod inside an Istio mTLS connection, so the hop is encrypted twice and the sidecar can verify the gateway identity. Authorization can only use L4 fields: principal and port.', objs: ['dr-billing-mtls', 'pa-billing', 'az-docs'] },
      { node: 4, title: 'App terminates TLS', text: 'The sidecar unwraps the mTLS layer and hands the original TLS stream to nginx on 8443. nginx presents the docs.billing.example.com certificate from its mounted Secret and completes the handshake with the client.', objs: ['dep-docs', 'sec-docs-tls', 'cert-docs', 'cm-docs', 'svc-docs'] }
    ]
  },
  test: `# The certificate you see must be the app's, issued for docs.billing.example.com
openssl s_client -connect $INGRESS_IP:443 -servername docs.billing.example.com </dev/null | openssl x509 -noout -subject -issuer

curl -v --resolve docs.billing.example.com:443:$INGRESS_IP https://docs.billing.example.com/

# The gateway listener should show a filter chain with server_names docs.billing.example.com and a tcp_proxy
istioctl proxy-config listeners deploy/istio-ingressgateway -n istio-ingress --port 443 -o yaml`,
  gotchas: [
    'Use protocol TLS on the Gateway server and tls routes in the VirtualService. http routes never match passthrough traffic.',
    'Clients that send no SNI (some old or IP-based clients) cannot be routed by passthrough.',
    'The Service port must be named tls-* (or appProtocol: tls). As http-* the sidecar tries to parse encrypted bytes.',
    'Certificate renewal is the app\'s job: the mounted Secret updates, but the process must reload it.',
    'L7 AuthorizationPolicy fields (paths, methods, hosts) cannot match. Use principals and ports.'
  ]
};

SC['in-tcp'] = {
  lanes: ['', 'istio-ingress', 'billing'],
  objects: ['helm-ingress', 'igw-svc', 'gw-ledger', 'igw-deploy', 'igw-sa', 'az-ledger-ip',
    'ns-billing', 'vs-ledger', 'svc-ledger', 'dep-ledger', 'sa-ledger', 'dr-billing-mtls', 'pa-billing', 'az-billing-deny', 'az-ledger'],
  focus: 'gw-ledger',
  edges: [
    ['helm-ingress', 'igw-svc', 'service.ports 5432'],
    ['igw-svc', 'igw-deploy', 'exposes :5432'],
    ['gw-ledger', 'igw-deploy', 'selector'],
    ['igw-deploy', 'igw-sa', 'serviceAccountName'],
    ['az-ledger-ip', 'igw-deploy', 'selector (DENY)'],
    ['vs-ledger', 'gw-ledger', 'gateways + port 5432'],
    ['vs-ledger', 'svc-ledger', 'destination.host'],
    ['svc-ledger', 'dep-ledger', 'selector'],
    ['dep-ledger', 'sa-ledger', 'serviceAccountName'],
    ['dr-billing-mtls', 'svc-ledger', 'ISTIO_MUTUAL'],
    ['pa-billing', 'dep-ledger', 'STRICT'],
    ['az-billing-deny', 'dep-ledger', 'deny by default'],
    ['az-ledger', 'dep-ledger', 'selector'],
    ['az-ledger', 'igw-sa', 'principals'],
    ['ns-billing', 'dep-ledger', 'injects sidecar']
  ],
  flow: {
    nodes: [
      { label: 'psql client', sub: '203.0.113.x', zone: 'ext' },
      { label: 'Cloud LB', sub: 'Service :5432', zone: 'ing' },
      { label: 'Ingress gateway', sub: 'TCP listener', zone: 'ing' },
      { label: 'Sidecar', sub: 'billing / ledger-db', zone: 'ten' },
      { label: 'ledger-db', sub: 'postgres :5432', zone: 'ten' }
    ],
    hops: [
      { enc: 'plain', label: 'TCP (Postgres protocol)' },
      { enc: 'plain', label: 'same TCP stream' },
      { enc: 'istio', label: 'Istio mTLS around TCP' },
      { enc: 'plain', label: 'TCP on localhost' }
    ],
    steps: [
      { node: 0, title: 'Client connects to :5432', text: 'Raw TCP: no SNI, no Host header. Whatever Postgres does inside (including its own SSL negotiation with sslmode=require) is opaque bytes to Istio.', objs: [] },
      { node: 1, title: 'Load balancer forwards :5432', text: 'Only works if the gateway Service lists port 5432. A Gateway server alone does not open a port on the load balancer.', objs: ['igw-svc', 'helm-ingress'] },
      { node: 2, title: 'Gateway matches by port', text: 'The ledger-gateway server opens a TCP listener on 5432. First the DENY policy drops clients outside 203.0.113.0/24. Then the VirtualService tcp rule for port 5432 sends the stream to ledger-db:5432. One port, one backend.', objs: ['gw-ledger', 'az-ledger-ip', 'vs-ledger'] },
      { node: 3, title: 'Wrapped in Istio mTLS', text: 'The gateway wraps the TCP stream in Istio mTLS. The sidecar enforces STRICT and allows the gateway principal on port 5432.', objs: ['dr-billing-mtls', 'pa-billing', 'az-ledger'] },
      { node: 4, title: 'Database receives TCP', text: 'Postgres sees a normal TCP connection from localhost.', objs: ['svc-ledger', 'dep-ledger'] }
    ]
  },
  test: `# Port open on the load balancer?
nc -vz $INGRESS_IP 5432

psql "host=$INGRESS_IP port=5432 user=ledger dbname=ledger sslmode=require"

# The gateway should have a 0.0.0.0_5432 listener with a tcp_proxy to outbound|5432||ledger-db.billing.svc.cluster.local
istioctl proxy-config listeners deploy/istio-ingressgateway -n istio-ingress --port 5432`,
  gotchas: [
    'The port must be on the gateway Service (and any cloud firewall), not only on the Gateway object.',
    'TCP routes can\'t tell clients apart by name. Two backends need two ports, or switch to TLS and route by SNI.',
    'Raw TCP from the internet is only as private as the protocol inside it. Use the database\'s own TLS, or terminate TLS at the gateway (Gateway protocol TLS, mode SIMPLE, with tcp routes) for protocols that start with a TLS handshake.',
    'remoteIpBlocks needs the real client IP: externalTrafficPolicy Local, or PROXY protocol from the load balancer.',
    'Name the Service port tcp-* so Istio doesn\'t wait to sniff the protocol.'
  ]
};

/* ---------------------------- Egress ------------------------------ */

SC['eg-orig'] = {
  lanes: ['istio-system', 'shop', 'istio-egress'],
  objects: ['helm-istiod',
    'dep-storefront', 'sa-storefront', 'sc-shop', 'se-payments', 'vs-payments', 'dr-shop-egw',
    'gw-eg-payments', 'egw-svc', 'egw-deploy', 'egw-sa', 'dr-orig-payments', 'az-egress'],
  focus: 'vs-payments',
  edges: [
    ['helm-istiod', 'se-payments', 'REGISTRY_ONLY needs'],
    ['dep-storefront', 'sa-storefront', 'serviceAccountName'],
    ['dep-storefront', 'se-payments', 'calls http://api.payments…'],
    ['sc-shop', 'se-payments', 'egress.hosts ./*'],
    ['sc-shop', 'egw-svc', 'egress.hosts istio-egress/*'],
    ['vs-payments', 'se-payments', 'hosts'],
    ['vs-payments', 'egw-svc', 'mesh rule → subset payments'],
    ['vs-payments', 'gw-eg-payments', 'gateways'],
    ['dr-shop-egw', 'egw-svc', 'subset: ISTIO_MUTUAL + SNI'],
    ['gw-eg-payments', 'egw-deploy', 'selector istio=egressgateway'],
    ['egw-svc', 'egw-deploy', 'selector'],
    ['egw-deploy', 'egw-sa', 'serviceAccountName'],
    ['dr-orig-payments', 'se-payments', 'host :443 TLS SIMPLE'],
    ['az-egress', 'egw-deploy', 'selector'],
    ['az-egress', 'sa-storefront', 'principals']
  ],
  flow: {
    nodes: [
      { label: 'storefront', sub: 'app in shop', zone: 'ten' },
      { label: 'Sidecar', sub: 'shop / storefront', zone: 'ten' },
      { label: 'Egress gateway', sub: 'istio-egress', zone: 'egr' },
      { label: 'api.payments', sub: '.example.com:443', zone: 'ext' }
    ],
    hops: [
      { enc: 'plain', label: 'HTTP to :80 (localhost)' },
      { enc: 'istio', label: 'Istio mTLS · SNI api.payments…' },
      { enc: 'tls', label: 'TLS originated by gateway' }
    ],
    steps: [
      { node: 0, title: 'App sends plain HTTP', text: 'storefront calls http://api.payments.example.com/charge. The request never leaves the pod unencrypted: iptables sends it to the sidecar first.', objs: ['dep-storefront'] },
      { node: 1, title: 'Sidecar routes to the egress gateway', text: 'The host is known because the ServiceEntry registers it (otherwise REGISTRY_ONLY sends it to the BlackHoleCluster) and the Sidecar resource lets shop see it. The VirtualService mesh rule sends port 80 to the egress gateway, subset payments. The subset wraps it in Istio mTLS with SNI api.payments.example.com.', objs: ['se-payments', 'sc-shop', 'vs-payments', 'dr-shop-egw', 'helm-istiod'] },
      { node: 2, title: 'Gateway checks, routes and adds TLS', text: 'The egress-payments server on port 80 terminates the mTLS (ISTIO_MUTUAL), so the gateway knows the caller is shop/storefront and can read the Host header. egress-allowlist allows that principal for this host. The VirtualService gateway rule sends it to api.payments.example.com:443, and originate-tls-payments makes the gateway open TLS with the right SNI and verify the server certificate.', objs: ['gw-eg-payments', 'az-egress', 'vs-payments', 'dr-orig-payments'] },
      { node: 3, title: 'External server sees normal HTTPS', text: 'The payments API receives a standard TLS connection from the egress gateway\'s public IP. You can give partners that one IP range to allowlist.', objs: [] }
    ]
  },
  test: `# From inside the app pod: should succeed and go via the egress gateway
kubectl -n shop exec deploy/storefront -c storefront -- curl -sS -o /dev/null -w '%{http_code}\\n' http://api.payments.example.com/health

# The egress gateway access log should show the request with outbound|443||api.payments.example.com
kubectl -n istio-egress logs deploy/istio-egressgateway | grep api.payments.example.com

# A host without a ServiceEntry should fail (502 / reset) because of REGISTRY_ONLY
kubectl -n shop exec deploy/storefront -c storefront -- curl -sS -o /dev/null -w '%{http_code}\\n' http://example.org/

# What the sidecar will do with port 80 traffic for this host
istioctl proxy-config routes deploy/storefront -n shop --name 80 -o json | grep -A3 api.payments`,
  gotchas: [
    'The app must call http:// on port 80 for origination. If it calls https:// itself, use the passthrough pattern instead.',
    'ServiceEntry and VirtualService need exportTo including istio-egress, or the egress gateway cannot see them.',
    'The DestinationRule subset sni must equal a host on the egress Gateway server, or the gateway has no matching filter chain.',
    'Put the origination DestinationRule in istio-egress with exportTo "." so only the gateway applies it. Sidecars that originate TLS themselves would bypass the gateway\'s policy.',
    'With a namespace Sidecar resource, forgetting istio-egress/* in egress.hosts gives 503s, because the egress gateway Service is invisible.'
  ]
};

SC['eg-mtls'] = {
  lanes: ['shop', 'istio-egress'],
  objects: ['dep-storefront', 'sa-storefront', 'sc-shop', 'se-bank', 'vs-bank', 'dr-shop-egw',
    'gw-eg-bank', 'egw-svc', 'egw-deploy', 'egw-sa', 'egw-role', 'egw-rb', 'dr-orig-bank', 'sec-bank-client', 'az-egress'],
  focus: 'dr-orig-bank',
  edges: [
    ['dep-storefront', 'sa-storefront', 'serviceAccountName'],
    ['dep-storefront', 'se-bank', 'calls http://bank…'],
    ['sc-shop', 'se-bank', 'egress.hosts ./*'],
    ['sc-shop', 'egw-svc', 'egress.hosts istio-egress/*'],
    ['vs-bank', 'se-bank', 'hosts'],
    ['vs-bank', 'egw-svc', 'mesh rule → subset bank'],
    ['vs-bank', 'gw-eg-bank', 'gateways'],
    ['dr-shop-egw', 'egw-svc', 'subset bank: ISTIO_MUTUAL + SNI'],
    ['gw-eg-bank', 'egw-deploy', 'selector'],
    ['egw-svc', 'egw-deploy', 'selector'],
    ['egw-deploy', 'egw-sa', 'serviceAccountName'],
    ['egw-rb', 'egw-role', 'roleRef'],
    ['egw-rb', 'egw-sa', 'subjects'],
    ['dr-orig-bank', 'se-bank', 'host :443 TLS MUTUAL'],
    ['dr-orig-bank', 'sec-bank-client', 'credentialName'],
    ['az-egress', 'egw-deploy', 'selector'],
    ['az-egress', 'sa-storefront', 'principals']
  ],
  flow: {
    nodes: [
      { label: 'storefront', sub: 'app in shop', zone: 'ten' },
      { label: 'Sidecar', sub: 'shop / storefront', zone: 'ten' },
      { label: 'Egress gateway', sub: 'holds client cert', zone: 'egr' },
      { label: 'bank.example.net', sub: ':443 requires mTLS', zone: 'ext' }
    ],
    hops: [
      { enc: 'plain', label: 'HTTP to :80 (localhost)' },
      { enc: 'istio', label: 'Istio mTLS · SNI bank…' },
      { enc: 'mtls', label: 'mTLS with bank client cert' }
    ],
    steps: [
      { node: 0, title: 'App sends plain HTTP', text: 'storefront calls http://bank.example.net. It has no access to the bank client key, which is the point: the key lives only in istio-egress.', objs: ['dep-storefront'] },
      { node: 1, title: 'Sidecar routes to the egress gateway', text: 'Same as TLS origination: the ServiceEntry makes the host known, the mesh rule picks subset bank, the subset adds Istio mTLS with SNI bank.example.net.', objs: ['se-bank', 'sc-shop', 'vs-bank', 'dr-shop-egw'] },
      { node: 2, title: 'Gateway originates mutual TLS', text: 'egress-bank terminates the mesh mTLS; egress-allowlist checks shop/storefront. The gateway rule targets bank.example.net:443, where originate-mtls-bank (mode MUTUAL) presents tls.crt/tls.key from bank-client-credential and verifies the bank against its ca.crt. istiod only serves that Secret because the egress gateway Role allows reading it.', objs: ['gw-eg-bank', 'az-egress', 'dr-orig-bank', 'sec-bank-client', 'egw-role'] },
      { node: 3, title: 'Bank verifies your certificate', text: 'The bank sees a client certificate it issued or registered, coming from your egress IP range.', objs: [] }
    ]
  },
  test: `kubectl -n shop exec deploy/storefront -c storefront -- curl -sS http://bank.example.net/v2/ping

# Client certificate loaded on the egress gateway? Look for file-cert / kubernetes://bank-client-credential
istioctl proxy-config secret deploy/istio-egressgateway -n istio-egress

# Cluster for the bank should show a transport socket with the client certificate
istioctl proxy-config clusters deploy/istio-egressgateway -n istio-egress --fqdn bank.example.net -o yaml | grep -A5 tlsCertificateSdsSecretConfigs`,
  gotchas: [
    'credentialName in a DestinationRule only works at gateways. A sidecar cannot load a Secret by name this way.',
    'The Secret must be in istio-egress and the egress gateway needs the Secret-reading Role, exactly as for ingress.',
    'ca.crt verifies the bank. Without it (or caCertificates) the gateway uses the system CA bundle, which may not include a private bank CA.',
    'If the bank pins your source IP, give them the egress gateway\'s NAT or node addresses, not the pod IPs.'
  ]
};

SC['eg-pass'] = {
  lanes: ['billing', 'istio-egress'],
  objects: ['dep-reporter', 'sa-reporter', 'sc-billing', 'se-files', 'vs-files', 'dr-billing-egw',
    'gw-eg-files', 'egw-svc', 'egw-deploy', 'egw-sa', 'az-egress'],
  focus: 'vs-files',
  edges: [
    ['dep-reporter', 'sa-reporter', 'serviceAccountName'],
    ['dep-reporter', 'se-files', 'calls https://files…'],
    ['sc-billing', 'se-files', 'egress.hosts ./*'],
    ['sc-billing', 'egw-svc', 'egress.hosts istio-egress/*'],
    ['vs-files', 'se-files', 'hosts'],
    ['vs-files', 'egw-svc', 'mesh tls rule → subset files'],
    ['vs-files', 'gw-eg-files', 'gateways + sniHosts'],
    ['dr-billing-egw', 'egw-svc', 'subset files (no TLS change)'],
    ['gw-eg-files', 'egw-deploy', 'selector'],
    ['egw-svc', 'egw-deploy', 'selector'],
    ['egw-deploy', 'egw-sa', 'serviceAccountName'],
    ['az-egress', 'egw-deploy', 'selector · SNI rule']
  ],
  flow: {
    nodes: [
      { label: 'reporter', sub: 'app does HTTPS', zone: 'ten' },
      { label: 'Sidecar', sub: 'billing / reporter', zone: 'ten' },
      { label: 'Egress gateway', sub: 'PASSTHROUGH', zone: 'egr' },
      { label: 'files.example.org', sub: ':443', zone: 'ext' }
    ],
    hops: [
      { enc: 'tls', label: 'app TLS · SNI files.example.org' },
      { enc: 'tls', label: 'same TLS, routed by SNI' },
      { enc: 'tls', label: 'same TLS, end to end' }
    ],
    steps: [
      { node: 0, title: 'App starts its own TLS', text: 'reporter connects to https://files.example.org and does the TLS handshake itself, with SNI files.example.org. Istio never holds keys for it.', objs: ['dep-reporter'] },
      { node: 1, title: 'Sidecar routes by SNI', text: 'The ServiceEntry declares port 443 as TLS, so the sidecar reads the SNI and applies the VirtualService mesh tls rule: send to the egress gateway on 443, subset files. That subset has no TLS settings, so the app\'s TLS goes out as it is.', objs: ['se-files', 'sc-billing', 'vs-files', 'dr-billing-egw'] },
      { node: 2, title: 'Gateway forwards by SNI', text: 'egress-files (protocol TLS, PASSTHROUGH) matches SNI files.example.org. The gateway rule sends the stream to files.example.org:443. The gateway cannot see the caller\'s identity or the HTTP request, so egress-allowlist can only allow this SNI on port 443.', objs: ['gw-eg-files', 'vs-files', 'az-egress'] },
      { node: 3, title: 'Server completes the handshake', text: 'files.example.org finishes TLS with the app. The egress gateway logged the connection, SNI and byte counts, and that is all it can see.', objs: [] }
    ]
  },
  test: `kubectl -n billing exec deploy/reporter -c reporter -- curl -sS -o /dev/null -w '%{http_code}\\n' https://files.example.org/

# Gateway log shows a TCP entry with SNI files.example.org (no path, no status code)
kubectl -n istio-egress logs deploy/istio-egressgateway | grep files.example.org

istioctl proxy-config listeners deploy/istio-egressgateway -n istio-egress --port 443`,
  gotchas: [
    'Use tls routes with sniHosts on both rules. An http route never matches encrypted traffic.',
    'The ServiceEntry port protocol must be TLS (or HTTPS). As HTTP, the sidecar tries to parse the ClientHello as HTTP.',
    'Don\'t add ISTIO_MUTUAL to the files subset: the egress Gateway server is PASSTHROUGH and expects the app\'s TLS, not Istio\'s.',
    'No caller identity on this hop. If you need per-workload control, prefer TLS origination, or limit which namespaces can see the ServiceEntry with exportTo.'
  ]
};

SC['eg-tcp'] = {
  lanes: ['istio-system', 'billing', 'istio-egress'],
  objects: ['helm-istiod',
    'dep-reporter', 'sa-reporter', 'sc-billing', 'se-backup', 'vs-backup', 'dr-billing-egw',
    'helm-egress', 'gw-eg-backup', 'egw-svc', 'egw-deploy', 'egw-sa', 'az-egress'],
  focus: 'se-backup',
  edges: [
    ['helm-istiod', 'se-backup', 'DNS capture + auto-allocate'],
    ['dep-reporter', 'sa-reporter', 'serviceAccountName'],
    ['dep-reporter', 'se-backup', 'connects backup-db:5432'],
    ['sc-billing', 'se-backup', 'egress.hosts ./*'],
    ['sc-billing', 'egw-svc', 'egress.hosts istio-egress/*'],
    ['vs-backup', 'se-backup', 'hosts'],
    ['vs-backup', 'egw-svc', 'mesh tcp rule → :5443 subset'],
    ['vs-backup', 'gw-eg-backup', 'gateways'],
    ['dr-billing-egw', 'egw-svc', 'subset backup-db: ISTIO_MUTUAL + SNI'],
    ['helm-egress', 'egw-svc', 'service.ports 5443'],
    ['gw-eg-backup', 'egw-deploy', 'selector'],
    ['egw-svc', 'egw-deploy', 'selector'],
    ['egw-deploy', 'egw-sa', 'serviceAccountName'],
    ['az-egress', 'egw-deploy', 'selector'],
    ['az-egress', 'sa-reporter', 'principals + SNI']
  ],
  flow: {
    nodes: [
      { label: 'reporter', sub: 'app in billing', zone: 'ten' },
      { label: 'Sidecar', sub: 'DNS proxy + TCP', zone: 'ten' },
      { label: 'Egress gateway', sub: ':5443 ISTIO_MUTUAL', zone: 'egr' },
      { label: 'backup-db', sub: '.example.org:5432', zone: 'ext' }
    ],
    hops: [
      { enc: 'plain', label: 'TCP to VIP:5432 (localhost)' },
      { enc: 'istio', label: 'Istio mTLS :5443 · SNI backup-db' },
      { enc: 'plain', label: 'TCP (Postgres may add its own TLS)' }
    ],
    steps: [
      { node: 0, title: 'App resolves and connects', text: 'reporter looks up backup-db.example.org. The sidecar\'s DNS proxy answers with an auto-allocated virtual IP (240.240.x.x). The app opens TCP to that IP on 5432.', objs: ['dep-reporter', 'helm-istiod'] },
      { node: 1, title: 'Sidecar matches IP and port', text: 'TCP has no hostname, so the sidecar matches the virtual IP and port to the ServiceEntry. The VirtualService mesh tcp rule sends it to the egress gateway on 5443, subset backup-db, which wraps the TCP stream in Istio mTLS with SNI backup-db.example.org.', objs: ['se-backup', 'sc-billing', 'vs-backup', 'dr-billing-egw'] },
      { node: 2, title: 'Gateway terminates mTLS, forwards TCP', text: 'egress-backup-db (TLS, ISTIO_MUTUAL on 5443) unwraps the mTLS and learns the caller is billing/reporter. egress-allowlist allows that principal for SNI backup-db.example.org. The gateway tcp rule connects to backup-db.example.org:5432, resolving it with real DNS.', objs: ['gw-eg-backup', 'az-egress', 'vs-backup', 'helm-egress'] },
      { node: 3, title: 'Database receives TCP', text: 'The external PostgreSQL sees a connection from the egress gateway. Use sslmode=require in the app if this last hop must be encrypted: the gateway passes Postgres TLS through untouched.', objs: [] }
    ]
  },
  test: `# The answer should be a 240.240.x.x address, from the sidecar DNS proxy
kubectl -n billing exec deploy/reporter -c reporter -- getent hosts backup-db.example.org

kubectl -n billing exec deploy/reporter -c reporter -- sh -c 'nc -vz backup-db.example.org 5432'

# The sidecar listener for the VIP and its route to the egress gateway
istioctl proxy-config listeners deploy/reporter -n billing --port 5432
istioctl proxy-config clusters deploy/reporter -n billing --fqdn istio-egressgateway.istio-egress.svc.cluster.local`,
  gotchas: [
    'Without DNS auto-allocation or explicit addresses, every TCP ServiceEntry on 5432 shares one 0.0.0.0:5432 listener. The second one silently captures the first one\'s traffic.',
    'Port 5443 must be on the egress gateway Service, the Gateway server, the DestinationRule subset and the VirtualService, all the same number.',
    'Gateway server protocol is TLS with ISTIO_MUTUAL, not TCP. TCP there would expect raw bytes and fail on the mTLS handshake.',
    'Apps that cache DNS results across pod restarts still work, since the virtual IP is stable for the host.'
  ]
};

/* ---------------------------- Operate ----------------------------- */

SC['lockdown'] = {
  lanes: ['istio-system', 'shop', 'billing', 'istio-egress'],
  objects: ['helm-istiod', 'pa-mesh', 'sc-shop', 'np-shop', 'az-shop-deny', 'sc-billing', 'np-billing', 'az-billing-deny', 'egw-deploy', 'az-egress'],
  focus: 'np-shop',
  edges: [
    ['az-egress', 'egw-deploy', 'selector'],
    ['helm-istiod', 'sc-shop', 'mesh default REGISTRY_ONLY'],
    ['helm-istiod', 'sc-billing', 'mesh default REGISTRY_ONLY'],
    ['np-shop', 'egw-deploy', 'allowed: in-cluster pods'],
    ['np-billing', 'egw-deploy', 'allowed: in-cluster pods'],
    ['sc-shop', 'egw-deploy', 'egress.hosts istio-egress/*'],
    ['sc-billing', 'egw-deploy', 'egress.hosts istio-egress/*']
  ]
};
