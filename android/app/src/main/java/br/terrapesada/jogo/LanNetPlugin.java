package br.terrapesada.jogo;

import android.content.Context;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Rede local (Wi‑Fi) do Terra Pesada.
 * Anfitrião: servidor WebSocket na porta 47800 + anúncio UDP (broadcast) na 47777.
 * Convidado: procura anúncios UDP; conecta pelo WebSocket do próprio WebView.
 */
@CapacitorPlugin(name = "LanNet")
public class LanNetPlugin extends Plugin {
    private static final int BEACON_PORT = 47777;

    private Server server;
    private volatile boolean beaconOn = false;
    private Thread beaconThread;
    private WifiManager.MulticastLock lock;
    private final Map<Integer, WebSocket> peers = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);

    private class Server extends WebSocketServer {
        Server(int port) { super(new InetSocketAddress(port)); }

        @Override public void onOpen(WebSocket conn, ClientHandshake handshake) {
            int id = nextId.getAndIncrement();
            conn.setAttachment(id);
            peers.put(id, conn);
            JSObject o = new JSObject();
            o.put("id", id);
            notifyListeners("join", o);
        }

        @Override public void onClose(WebSocket conn, int code, String reason, boolean remote) {
            Integer id = conn.getAttachment();
            if (id == null) return;
            peers.remove(id);
            JSObject o = new JSObject();
            o.put("id", id);
            notifyListeners("leave", o);
        }

        @Override public void onMessage(WebSocket conn, String message) {
            Integer id = conn.getAttachment();
            JSObject o = new JSObject();
            o.put("id", id == null ? 0 : id);
            o.put("data", message);
            notifyListeners("msg", o);
        }

        @Override public void onError(WebSocket conn, Exception ex) { }

        @Override public void onStart() { setConnectionLostTimeout(10); }
    }

    @PluginMethod
    public void host(PluginCall call) {
        stopAll();
        int port = call.getInt("port", 47800);
        String name = call.getString("name", "Sala");
        try {
            server = new Server(port);
            server.setReuseAddr(true);
            server.setTcpNoDelay(true);
            server.start();
        } catch (Exception e) {
            call.reject("Não foi possível abrir a sala: " + e.getMessage());
            return;
        }
        startBeacon(name, port);
        JSObject r = new JSObject();
        r.put("ip", localIp());
        r.put("port", port);
        call.resolve(r);
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data", "");
        Integer to = call.getInt("to", 0);
        if (to != null && to > 0) {
            WebSocket c = peers.get(to);
            if (c != null && c.isOpen()) c.send(data);
        } else {
            for (WebSocket c : peers.values()) if (c.isOpen()) c.send(data);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAll();
        call.resolve();
    }

    @PluginMethod
    public void localAddress(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ip", localIp());
        call.resolve(r);
    }

    @PluginMethod
    public void discover(PluginCall call) {
        final int ms = call.getInt("ms", 3000);
        new Thread(() -> {
            acquireLock();
            DatagramSocket sock = null;
            List<String> seen = new ArrayList<>();
            try {
                sock = new DatagramSocket(null);
                sock.setReuseAddress(true);
                sock.setBroadcast(true);
                sock.bind(new InetSocketAddress(BEACON_PORT));
                sock.setSoTimeout(400);
                long end = System.currentTimeMillis() + ms;
                byte[] buf = new byte[512];
                while (System.currentTimeMillis() < end) {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try { sock.receive(p); } catch (SocketTimeoutException t) { continue; }
                    String msg = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                    if (!msg.startsWith("TERRAPESADA|")) continue;
                    String[] parts = msg.split("\\|");
                    if (parts.length < 3) continue;
                    String ip = p.getAddress().getHostAddress();
                    if (seen.contains(ip)) continue;
                    seen.add(ip);
                    JSObject o = new JSObject();
                    o.put("ip", ip);
                    o.put("port", Integer.parseInt(parts[1]));
                    o.put("name", parts[2]);
                    notifyListeners("room", o);
                }
            } catch (Exception e) {
                // sem rede: devolve lista vazia
            } finally {
                if (sock != null) sock.close();
                releaseLock();
            }
            call.resolve();
        }).start();
    }

    private void startBeacon(String name, int port) {
        beaconOn = true;
        beaconThread = new Thread(() -> {
            DatagramSocket sock = null;
            try {
                sock = new DatagramSocket();
                sock.setBroadcast(true);
                byte[] data = ("TERRAPESADA|" + port + "|" + name).getBytes(StandardCharsets.UTF_8);
                while (beaconOn) {
                    for (InetAddress a : broadcastAddresses()) {
                        try { sock.send(new DatagramPacket(data, data.length, a, BEACON_PORT)); } catch (Exception ignored) { }
                    }
                    Thread.sleep(1000);
                }
            } catch (Exception ignored) {
            } finally {
                if (sock != null) sock.close();
            }
        });
        beaconThread.start();
    }

    private List<InetAddress> broadcastAddresses() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) out.add(ia.getBroadcast());
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    private String localIp() {
        String fallback = "";
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address)) continue;
                    String ip = a.getHostAddress();
                    String n = ni.getName();
                    if (n.startsWith("wlan") || n.startsWith("ap") || n.startsWith("swlan")) return ip;
                    if (fallback.isEmpty()) fallback = ip;
                }
            }
        } catch (Exception ignored) { }
        return fallback;
    }

    private void acquireLock() {
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && lock == null) {
                lock = wm.createMulticastLock("terrapesada");
                lock.setReferenceCounted(false);
                lock.acquire();
            }
        } catch (Exception ignored) { }
    }

    private void releaseLock() {
        try { if (lock != null) { lock.release(); lock = null; } } catch (Exception ignored) { }
    }

    private void stopAll() {
        beaconOn = false;
        if (server != null) {
            try { server.stop(500); } catch (Exception ignored) { }
            server = null;
        }
        peers.clear();
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
        releaseLock();
    }
}
