package com.jarvis.gateway;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Gateway-edge JWT validation. Public paths (login, actuator) pass through; everything else needs
 * a valid Bearer token signed with the shared secret. Downstream services validate again
 * (defence in depth). This filter just fast-rejects bad/absent tokens at the edge.
 */
@Component
public class JwtAuthGatewayFilter implements GlobalFilter, Ordered {

    private final SecretKey key;
    private final List<String> publicPaths;

    public JwtAuthGatewayFilter(
        @Value("${jarvis.security.jwt-secret}") String secret,
        @Value("${jarvis.security.public-paths}") List<String> publicPaths) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.publicPaths = publicPaths;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();

        if (request.getMethod().name().equals("OPTIONS") || isPublic(path)) {
            return chain.filter(exchange);
        }

        String auth = request.getHeaders().getFirst("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            return unauthorized(exchange);
        }
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(auth.substring(7));
        } catch (Exception e) {
            return unauthorized(exchange);
        }
        return chain.filter(exchange);
    }

    private boolean isPublic(String path) {
        return publicPaths.stream().anyMatch(p -> p.endsWith("/**")
            ? path.startsWith(p.substring(0, p.length() - 3))
            : path.equals(p) || path.startsWith(p));
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    @Override
    public int getOrder() {
        return -1; // run before routing
    }
}
