//@ts-check

function log(...args) {
    console.log.apply(
        null,
        [new Date().toISOString(), "[Main Thread]"].concat(Array.from(args)),
    );
}

function getBearerToken() {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const header = btoa(JSON.stringify({
                alg: "HS256",
                typ: "JWT",
            }));
            const payload = btoa(
                JSON.stringify({
                    sub: "1234567890",
                    name: "John Doe",
                    email: "john.doe@example.com",
                    userPrincipalName: "john.doe@example.com",
                    exp: Date.now(),
                }),
            );
            const signature =
                "3693c3cec84b77844f5d315ec3b1f59e342ab899d457ca250eaab7f3b3fb23ba";

            resolve(`${header}.${payload}.${signature}`);
        }, 1000);
    });
}

const worker = navigator.serviceWorker;

/**
 * @param {ServiceWorkerRegistration} registration
 */
function setupCommunication(registration) {
    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
        switch (event.data.type) {
            case "GET_AUTHORIZATION":
                getBearerToken().then((token) => {
                    worker.controller?.postMessage({
                        id: event.data.id,
                        payload: "Bearer " + token,
                    });
                });
                break;
            case "SW_VERSION":
                log("Service Worker", event.data.version);
                break;
            default:
                console.warn(
                    "Untracked message received from Service Worker",
                    event.data,
                );
        }
    };

    if (worker.controller) {
        log("sending MessageChannel to Service Worker")
        worker.controller.postMessage({ type: "INIT_PORT" }, [
            messageChannel.port2,
        ]);
    }
}

/**
 * 
 * @param {string} swPath 
 * @returns 
 */
async function registerServiceWorker(swPath) {
    worker.addEventListener("controllerchange", () => {
        log("Service Worker changed");
    });

    const registrations = await worker.getRegistrations();
    await Promise.allSettled(
        registrations.map((registration) => registration.unregister()),
    );

    const registration = await worker.register(swPath);
    await registration.update();

    return setupCommunication(registration);
}

registerServiceWorker("sw.js").then(() => {
    const root = document.getElementById("root");

    if (root) {
        root.innerHTML = `
        <img src="/api/cog.png">
        <a href="/api/cog.png" download>Download</a>`;
    }
});
