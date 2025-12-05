/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration.unregister().then(() => {
                return self.clients.matchAll();
            }).then(clients => {
                clients.forEach(client => client.navigate(client.url));
            });
        }
    });
    self.addEventListener("fetch", function (event) {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }
        event.respondWith(fetch(r).then((response) => {
            if (response.status === 0) {
                return response;
            }
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
            if (!coepCredentialless) {
                newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
            }
            newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        }));
    });
} else {
    // C'est ici que la magie opère côté client
    if (window.crossOriginIsolated !== false) {
        // Tout va bien, on est isolé
    } else {
        const n = navigator;
        if (n.serviceWorker) {
            n.serviceWorker.register(window.document.currentScript.src).then((registration) => {
                console.log("COI Service Worker registered. Reloading...");
                // On force un rechargement pour activer l'isolation immédiatement
                window.location.reload();
            }, (err) => {
                console.error("COI Service Worker failed to register", err);
            });
        }
    }
}