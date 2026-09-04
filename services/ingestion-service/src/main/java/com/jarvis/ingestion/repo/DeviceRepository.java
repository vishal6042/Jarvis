package com.jarvis.ingestion.repo;

import com.jarvis.ingestion.domain.Device;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceRepository extends JpaRepository<Device, String> {

    List<Device> findAllByOrderByLastSeenAtDesc();
}
