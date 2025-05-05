//@ts-check
const SW_VERSION = "1.0.1";
const CACHE_KEY = "CACHE_" + SW_VERSION;
const TIMEOUT = 1 * 30 * 1000;

let message_channel = null;

function log(...args){
    console.log.apply(null, [new Date().toISOString(), "[ServiceWorker]"].concat(Array.from(args)))
}

function getRandomId() {
    return Date.now().toString(32) + "-" +
        Math.abs((Math.random() * 1e10) | 0).toString(32) + "-" +
        Math.abs((Math.random() * 1e10) | 0).toString(32);
}

const message_listeners = new Map();

function sendMessage(type, payload) {
    if (message_channel == null) {
        return Promise.reject("No MessageChannel");
    }

    const promise = new Promise((resolve, reject) => {
        const id = getRandomId();

        const rejection_timeout = setTimeout(() => {
            message_listeners.delete(id);
            reject("Request timeout");
        }, TIMEOUT);

        message_listeners.set(id, (response) => {
            clearTimeout(rejection_timeout);
            resolve(response);
        });

        const message = {
            id,
            type,
            payload,
        }

        log("sending message", message)

        message_channel.postMessage(message);
    });

    return promise;
}

self.addEventListener("message", (event) => {
    if (event.data.type === "INIT_PORT") {
        message_channel = event.ports[0];

        if (message_channel != null) {
            message_channel.postMessage({
                id: getRandomId(),
                type: "SW_VERSION",
                version: SW_VERSION,
            });

            message_channel.addEventListener("message", (message) => {
                //
            });
        }

        return;
    }

    const id = event.data.id;
    
    log("received message", event.data);

    if (id != null && message_listeners.has(id)) {
        const callback = message_listeners.get(id);
        if (typeof callback === "function") {
            callback(event.data.payload);
        }
    }
});

self.addEventListener("fetch", function (event) {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith("/service-worker-bearer-token/api/")) {
        log("intercepted", event.request.url);

        event.respondWith(
            sendMessage("GET_AUTHORIZATION").then((bearer) => {
                log("authorization", bearer);
                if (typeof bearer === "string" && bearer.trim() !== "") {
                    const newRequest = new Request(event.request, {
                        headers: { "Authorization": bearer },
                        mode: "cors",
                        credentials: "omit",
                    });

                    return fetch(newRequest);
                }

                throw new Error("Unauthorized");
            }),
        );
    }
});

self.addEventListener("install", () => {
    // https://web.dev/articles/service-worker-lifecycle#skip_the_waiting_phase
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        // Delete all old caches
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_KEY) {
                        return caches.delete(key);
                    }
                }),
            )
        ).then(() => {
            // Force reload all the current open windows/tabs as soon as the 
            // new service worker activates, rather than users having to 
            // manually reload.
            self.clients.matchAll({ type: "window" }).then((windowClients) => {
                windowClients.forEach((windowClient) => {
                    windowClient.navigate(windowClient.url);
                });
            });
        }),
    );
});
