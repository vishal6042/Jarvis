package com.jarvis.common.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Shared stateless-JWT security, imported automatically by every servlet service that depends on
 * this module. Each service declares its own open endpoints via {@code jarvis.security.public-paths}
 * (actuator health/info are always open); everything else needs a valid Bearer token.
 */
@AutoConfiguration
@EnableWebSecurity
public class CommonSecurityAutoConfiguration {

    @Bean
    public JwtTokenService jwtTokenService(
        @Value("${jarvis.security.jwt-secret}") String secret,
        @Value("${jarvis.security.jwt-ttl-minutes:1440}") long ttlMinutes) {
        return new JwtTokenService(secret, ttlMinutes);
    }

    @Bean
    public JwtAuthFilter jwtAuthFilter(JwtTokenService jwtTokenService) {
        return new JwtAuthFilter(jwtTokenService);
    }

    @Bean
    public SecurityFilterChain filterChain(
        HttpSecurity http,
        JwtAuthFilter jwtAuthFilter,
        @Value("${jarvis.security.public-paths:}") List<String> publicPaths)
        throws Exception {
        String[] open = java.util.stream.Stream
            .concat(List.of("/actuator/health", "/actuator/info").stream(), publicPaths.stream())
            .filter(p -> !p.isBlank())
            .toArray(String[]::new);
        http
            // CORS is owned solely by the api-gateway (the only browser-facing entry point).
            // Services behind it must NOT add their own CORS headers, or the browser sees two
            // Access-Control-Allow-Origin values on gateway-proxied responses and rejects them.
            .cors(cors -> cors.disable())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(open).permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(eh -> eh.authenticationEntryPoint(unauthorizedEntryPoint()))
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** Return 401 (not a redirect) for unauthenticated API calls. */
    private AuthenticationEntryPoint unauthorizedEntryPoint() {
        return (request, response, authException) ->
            response.sendError(HttpStatus.UNAUTHORIZED.value(), "Unauthorized");
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
        @Value("${jarvis.cors.allowed-origins:http://localhost:5173}") List<String> allowedOrigins) {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(allowedOrigins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
