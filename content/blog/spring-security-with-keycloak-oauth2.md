---
title: "Spring Security 集成 Keycloak 实现用户 RBAC、ABAC 授权"
description: "介绍 Spring Security Resource Server 对接 Keycloak，实现 OAuth2 认证、JWT 解析与 RBAC、ABAC 授权。"
summary: ""
date: 2024-11-24T16:44:35+08:00
lastmod: 2025-12-18T22:36:51+08:00
draft: false
weight: 50
categories: [spring, idaas]
tags: [spring, idaas, oauth2, keycloak, Spring Security, RBAC, ABAC]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Spring Security 集成 Keycloak：RBAC/ABAC 授权与 JWT Token 解析实战"
  description: "介绍 Spring Security Resource Server 对接 Keycloak，实现 OAuth2 认证、JWT 解析与 RBAC、ABAC 授权。"
  canonical: ""
  noindex: false
---

使用 Spring Security Resource Server 和 Keycloak，实现用户 RBAC、ABAC 授权，主要介绍：

1. Spring Security Resource Server 如何与标准 OAuth2 协议集成。
2. Spring Security Resource Server 如何与 Keycloak Authorization Server 集成。
3. 如何校验和解析 JWT Token，获取用户详细信息。
4. 如何使用 keycloak admin client 获取更多信息，执行更高级动作。
5. Spring Security JWT Token 模式下如何方便本地 Debug，如何通过 keycloak admin client 模拟用户登录。

在开始之前我们先解释几点：

1. Keycloak 官方的 Spring Boot Starter 后续将逐渐停止维护，所以我们只用 keycloak 的 client，自己实现一部分代码，有 client sdk 实现起来很容易。
2. Spring Security [OAuth 2.0 Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html) 也有多种集成方式，这里我们只实现 `JWT` 这一种，并且是 sessionless 的，也就是只负责授权不负责 `登录认证`， 登录由网关通过 oauth2-proxy 实现，详情可参考另一篇博客介绍 [traefik-oauth2-proxy-keycloak](https://www.xlabs.club/blog/traefik-oauth2-proxy-keycloak/)。

## 依赖配置

核心依赖如下（Gradle 格式，Maven 同理）：

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-oauth2-resource-server'
    implementation 'org.keycloak:keycloak-admin-client:24.0.3'
}
```

## Resource Server 配置

配置 `application.yml`，指向 Keycloak 的 Issuer URI：

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://keycloak.example.com/realms/your-realm
          jwk-set-uri: https://keycloak.example.com/realms/your-realm/protocol/openid-connect/certs
```

`issuer-uri` 是必须的，Spring Security 会从该 URI 的 `/.well-known/openid-configuration` 自动发现 JWK Set URI 等端点。若内网网络不通，可通过 `jwk-set-uri` 直接指定。

### SecurityFilterChain

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/public/**").permitAll()
                .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt
                    .jwtAuthenticationConverter(jwtAuthenticationConverter())
                )
            );
        return http.build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        // 自定义 GrantedAuthorities 的提取逻辑
        converter.setJwtGrantedAuthoritiesConverter(new KeycloakAuthoritiesConverter());
        return converter;
    }
}
```

## JWT 角色提取——自定义 GrantedAuthoritiesConverter

Keycloak 默认将 Realm Roles 放在 `realm_access.roles`，Client Roles 放在 `resource_access.<client-id>.roles`。以下 Converter 从 JWT 提取所有角色并映射为 Spring Security GrantedAuthority：

```java
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.*;
import java.util.stream.Collectors;

public class KeycloakAuthoritiesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        List<GrantedAuthority> authorities = new ArrayList<>();

        // 提取 Realm Roles
        Map<String, Object> realmAccess = jwt.getClaim("realm_access");
        if (realmAccess != null) {
            List<String> realmRoles = (List<String>) realmAccess.get("roles");
            if (realmRoles != null) {
                realmRoles.forEach(role ->
                    authorities.add(new SimpleGrantedAuthority("ROLE_" + role)));
            }
        }

        // 提取指定 Client 的 Roles
        Map<String, Object> resourceAccess = jwt.getClaim("resource_access");
        if (resourceAccess != null) {
            // 替换 your-client-id 为实际的 Keycloak Client ID
            Map<String, Object> clientAccess =
                (Map<String, Object>) resourceAccess.get("your-client-id");
            if (clientAccess != null) {
                List<String> clientRoles = (List<String>) clientAccess.get("roles");
                if (clientRoles != null) {
                    clientRoles.forEach(role ->
                        authorities.add(new SimpleGrantedAuthority("ROLE_" + role)));
                }
            }
        }

        return authorities;
    }
}
```

如果需要更灵活的权限映射（例如读取 JWT 中的 `groups` 或自定义 claim），在这里扩展即可。

## RBAC 实现

启用 `@EnableMethodSecurity` 后，使用注解实现基于角色的访问控制：

```java
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @GetMapping("/dashboard")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<String> adminDashboard() {
        return ResponseEntity.ok("Admin Dashboard Data");
    }

    @GetMapping("/reports")
    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYST')")
    public ResponseEntity<String> reports() {
        return ResponseEntity.ok("Reports Data");
    }

    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> profile(@AuthenticationPrincipal Jwt jwt) {
        String username = jwt.getClaimAsString("preferred_username");
        return ResponseEntity.ok("Profile of: " + username);
    }
}
```

## ABAC 实现（基于属性的访问控制）

当授权逻辑不满足于"有某个角色"时，使用 ABAC。典型场景：用户只能访问属于自己的资源、用户所属 Team 的可见范围等。

### 自定义 PermissionEvaluator

```java
import org.springframework.security.access.PermissionEvaluator;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.io.Serializable;
import java.util.Map;

@Component
public class KeycloakPermissionEvaluator implements PermissionEvaluator {

    @Override
    public boolean hasPermission(Authentication auth, Object targetDomainObject, Object permission) {
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
            return false;
        }

        // 从 JWT 中获取用户属性
        String userId = jwt.getClaimAsString("sub");
        String teamId = jwt.getClaimAsString("team_id");

        // 根据 targetDomainObject 判断是否有权限
        if (targetDomainObject instanceof Order order) {
            return "READ".equals(permission) &&
                   (order.getOwnerId().equals(userId) ||
                    order.getTeamId().equals(teamId));
        }

        return false;
    }

    @Override
    public boolean hasPermission(Authentication auth,
                                  Serializable targetId,
                                  String targetType,
                                  Object permission) {
        // 根据 ID 查询实体后再调用上面的方法
        // return hasPermission(auth, findById(targetId), permission);
        return false;
    }
}
```

### 注册 PermissionEvaluator

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.access.expression.method.MethodSecurityExpressionHandler;

@Configuration
public class MethodSecurityConfig {

    @Bean
    public MethodSecurityExpressionHandler methodSecurityExpressionHandler(
            KeycloakPermissionEvaluator evaluator) {
        DefaultMethodSecurityExpressionHandler handler =
            new DefaultMethodSecurityExpressionHandler();
        handler.setPermissionEvaluator(evaluator);
        return handler;
    }
}
```

### 在 Controller 中使用

```java
@GetMapping("/orders/{id}")
@PreAuthorize("hasPermission(#id, 'Order', 'READ')")
public ResponseEntity<Order> getOrder(@PathVariable Long id) {
    return ResponseEntity.ok(orderService.findById(id));
}

@DeleteMapping("/orders/{id}")
@PreAuthorize("hasPermission(#id, 'Order', 'DELETE')")
public ResponseEntity<Void> deleteOrder(@PathVariable Long id) {
    orderService.delete(id);
    return ResponseEntity.noContent().build();
}
```

## Keycloak Admin Client

需要在 Keycloak 后台创建一个 `confidential` Client，启用 `Service Account Roles`，并在 `Service Account Roles` 中分配相应的 Realm Management 角色（如 `view-users`、`manage-users`）。

```java
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class KeycloakAdminService {

    private final Keycloak keycloak;
    private final String realm;

    public KeycloakAdminService(
            @Value("${keycloak.server-url}") String serverUrl,
            @Value("${keycloak.realm}") String realm,
            @Value("${keycloak.client-id}") String clientId,
            @Value("${keycloak.client-secret}") String clientSecret) {
        this.realm = realm;
        this.keycloak = KeycloakBuilder.builder()
            .serverUrl(serverUrl)
            .realm(realm)
            .clientId(clientId)
            .clientSecret(clientSecret)
            .grantType(org.keycloak.OAuth2Constants.CLIENT_CREDENTIALS)
            .build();
    }

    public List<UserRepresentation> searchUsers(String search) {
        return keycloak.realm(realm).users().search(search, 0, 20);
    }

    public UserRepresentation getUserById(String userId) {
        return keycloak.realm(realm).users().get(userId).toRepresentation();
    }

    public List<UserRepresentation> getUsersByRole(String roleName) {
        return keycloak.realm(realm)
            .roles().get(roleName)
            .getRoleUserMembers();
    }
}
```

## 本地开发与 Debug

本地开发时无法直连 Keycloak 是常见痛点。几种方案可供选择：

### 方案 A：HTTPS 隧道（推荐）

使用 ngrok 或类似工具将本地服务暴露为 HTTPS，通过网关（已集成 oauth2-proxy）正常登录即可。关键在于本地启动时关闭 Resource Server 的 issuer-uri 校验，改用本地 JWT 解码：

```yaml
# 本地配置（application-local.yml）
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://keycloak.example.com/realms/your-realm
```

配合抓到的真实 Token 在 IDEA HTTP Client 或 curl 中手动注入 Header 即可调用被保护的接口。

### 方案 B：Keycloak 模拟登录

通过 Keycloak Admin Client 直接获取指定用户的 Token：

```java
// 获取用户模拟 Token
String impersonateToken = keycloak.realm(realm).users()
    .get(userId)
    .impersonate();
```

但请注意：Keycloak 24+ 对用户模拟有更严格的权限要求，需要 `impersonation` role。

### 方案 C：本地 Keycloak Dev Service

```bash
# 使用 Testcontainers Keycloak 模块（仅测试环境推荐）
docker run -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:24.0.3 start-dev
```

### Debug Token 的实用命令

```bash
# 解码 JWT（不校验签名）
echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq .

# 或使用 jq 直接格式化
echo "$TOKEN" | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

## 安全建议

1. JWT 中不要放置敏感信息（Token 本身不加密，仅签名）。
2. 在生产环境务必启用 HTTPS，Keycloak 和 Resource Server 之间的 JWK Set 请求必须走 TLS。
3. 关注 Token 过期时间，Keycloak 默认 Access Token 有效期 5 分钟，考虑使用 Refresh Token 轮换机制。
4. Keycloak Admin Client Secret 作为机密管理，存放于 Secret Manager 或 K8S Secret 中。
