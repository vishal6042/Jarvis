package com.jarvis.ingestion.web;

import com.jarvis.ingestion.domain.Device;
import com.jarvis.ingestion.repo.DeviceRepository;
import com.jarvis.ingestion.web.dto.DeviceHeartbeat;
import java.time.Instant;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Connected phones (Jarvis Sync app): heartbeats in, a list for the web app out. */
@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceRepository devices;

    public DeviceController(DeviceRepository devices) {
        this.devices = devices;
    }

    @GetMapping
    public List<Device> list() {
        return devices.findAllByOrderByLastSeenAtDesc();
    }

    /** Upsert by the app's own id; every field the phone sends replaces the stored one. */
    @PutMapping("/{id}")
    public Device heartbeat(@PathVariable String id, @RequestBody DeviceHeartbeat hb) {
        Device d = devices.findById(id).orElseGet(() -> {
            Device n = new Device();
            n.setId(id);
            return n;
        });
        if (hb.name() != null) d.setName(hb.name());
        if (hb.manufacturer() != null) d.setManufacturer(hb.manufacturer());
        if (hb.model() != null) d.setModel(hb.model());
        if (hb.osVersion() != null) d.setOsVersion(hb.osVersion());
        if (hb.appVersion() != null) d.setAppVersion(hb.appVersion());
        if (hb.forwardingEnabled() != null) d.setForwardingEnabled(hb.forwardingEnabled());
        if (hb.pendingCount() != null) d.setPendingCount(hb.pendingCount());
        if (hb.forwardedTotal() != null) d.setForwardedTotal(hb.forwardedTotal());
        if (hb.lastSyncAt() != null) d.setLastSyncAt(hb.lastSyncAt());
        d.setLastSeenAt(Instant.now());
        return devices.save(d);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> forget(@PathVariable String id) {
        devices.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
