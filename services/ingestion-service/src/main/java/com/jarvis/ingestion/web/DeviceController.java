package com.jarvis.ingestion.web;

import com.jarvis.common.security.Caller;
import com.jarvis.common.security.CallerContext;
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
        // A confined sign-in sees only its own phones. Everyone used to see every device in the
        // household, down to its forwarding counters and when it last synced.
        Long confined = CallerContext.restrictedTo();
        List<Device> all = devices.findAllByOrderByLastSeenAtDesc();
        return confined == null ? all : all.stream().filter(d -> confined.equals(d.getMemberId())).toList();
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
        // Attribute the phone to whoever it is signed in as, so the listing above can scope it.
        CallerContext.current().map(Caller::memberId).ifPresent(d::setMemberId);
        return devices.save(d);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> forget(@PathVariable String id) {
        // Reads as missing rather than forbidden, so it cannot be used to probe for other
        // people's device ids.
        Long confined = CallerContext.restrictedTo();
        if (confined != null && devices.findById(id).filter(d -> confined.equals(d.getMemberId())).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        devices.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
