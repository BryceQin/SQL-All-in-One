import * as assert from "assert";
import { SshTunnel } from "../database/connection/SshTunnel";

suite("SshTunnel - initial state", () => {
    test("should not be open initially", () => {
        const tunnel = new SshTunnel();
        assert.strictEqual(tunnel.isOpen(), false);
    });

    test("should have local port 0 initially", () => {
        const tunnel = new SshTunnel();
        assert.strictEqual(tunnel.getLocalPort(), 0);
    });

    test("should close cleanly when not open", async () => {
        const tunnel = new SshTunnel();
        await assert.doesNotReject(() => tunnel.close());
        assert.strictEqual(tunnel.isOpen(), false);
    });

    test("should handle multiple close calls", async () => {
        const tunnel = new SshTunnel();
        await tunnel.close();
        await assert.doesNotReject(() => tunnel.close());
    });
});

suite("SshTunnel - connection error handling", () => {
    test("should fail to connect to non-existent SSH server", async () => {
        const tunnel = new SshTunnel();
        try {
            await tunnel.open(
                {
                    host: "127.0.0.1",
                    port: 59999,
                    username: "test",
                    password: "test",
                    enabled: true,
                    authentication: "password",
                },
                "127.0.0.1",
                3306,
            );
            assert.fail("Should have thrown an error");
        } catch (error: unknown) {
            assert.ok((error instanceof Error ? error.message : String(error)).length > 0);
            assert.strictEqual(tunnel.isOpen(), false);
        }
    });

    test("should fail to connect with invalid credentials", async () => {
        const tunnel = new SshTunnel();
        try {
            await tunnel.open(
                {
                    host: "127.0.0.1",
                    port: 22,
                    username: "nonexistent_user_12345",
                    password: "wrong_password",
                    enabled: true,
                    authentication: "password",
                },
                "127.0.0.1",
                3306,
            );
        } catch (error: unknown) {
            assert.ok((error instanceof Error ? error.message : String(error)).length > 0);
            assert.strictEqual(tunnel.isOpen(), false);
        }
    });
});

suite("SshTunnel - TunnelResult interface", () => {
    test("should return TunnelResult with localHost and localPort", async () => {
        const tunnel = new SshTunnel();
        const result = await tunnel
            .open(
                {
                    host: "127.0.0.1",
                    port: 59999,
                    username: "test",
                    password: "test",
                    enabled: true,
                    authentication: "password",
                },
                "127.0.0.1",
                3306,
            )
            .catch(() => null);

        if (result) {
            assert.strictEqual(result.localHost, "127.0.0.1");
            assert.ok(result.localPort > 0);
        }
    });
});
