package com.jarvis.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Validates the Bearer JWT on each request and populates the SecurityContext. Every downstream
 * service runs this (defence in depth) using the same shared secret — no service trusts headers.
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtTokenService jwtTokenService;

    public JwtAuthFilter(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    /**
     * Also run on ASYNC dispatches. Streaming endpoints (StreamingResponseBody, e.g. statement
     * scanning) complete on an async thread; Spring Security's AuthorizationFilter re-checks on that
     * async dispatch, so the JWT must be re-validated there too or the dispatch is denied (Access
     * Denied) and the response can't finish cleanly.
     */
    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            try {
                Claims claims = jwtTokenService.parse(token);
                String username = claims.getSubject();
                String roles = claims.get("roles", String.class);
                List<SimpleGrantedAuthority> authorities =
                    Arrays.stream(roles == null ? new String[0] : roles.split(","))
                        .filter(r -> !r.isBlank())
                        .map(r -> new SimpleGrantedAuthority("ROLE_" + r.trim()))
                        .toList();
                var auth = new UsernamePasswordAuthenticationToken(username, null, authorities);
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException | IllegalArgumentException e) {
                // Invalid/expired token → leave context unauthenticated (request gets 401).
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }
}
