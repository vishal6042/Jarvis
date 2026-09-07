# The Jarvis backend stack, in start order. Single source of truth for both launchers:
#   start-all.ps1        (one window per service - for restarting a subset while you work)
#   ../start-jarvis.ps1  (one combined window - what the desktop shortcut runs)
#
# `wait` is the pause before the NEXT service starts: Eureka needs a head start so the
# rest register cleanly; the gateway is last and waits for nobody.
@(
    @{ n = 1; name = "discovery-service";       port = 8761; wait = 12 },
    @{ n = 2; name = "auth-service";            port = 8081; wait = 4  },
    @{ n = 3; name = "expense-service";         port = 8082; wait = 4  },
    @{ n = 4; name = "ai-orchestrator-service"; port = 8084; wait = 4  },
    @{ n = 5; name = "ingestion-service";       port = 8083; wait = 4  },
    @{ n = 6; name = "finance-service";         port = 8085; wait = 4  },
    @{ n = 7; name = "notification-service";    port = 8086; wait = 4  },
    @{ n = 8; name = "api-gateway";             port = 8080; wait = 0  }
)
