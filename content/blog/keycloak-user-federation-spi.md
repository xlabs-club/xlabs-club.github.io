---
title: "Keycloak 自定义 User Federation SPI 实现：对接企业已有用户系统"
description: "通过 Keycloak SPI 实现自定义用户联合，将企业已有的 LDAP、AD 或自有用户系统接入 Keycloak 统一认证。"
summary: ""
date: 2025-01-11T17:37:14+08:00
lastmod: 2025-01-11T17:37:14+08:00
draft: false
weight: 50
categories: [Keycloak, Java]
tags: [Keycloak, SPI, 用户联合, 统一认证, Java]
contributors: [l10178]
pinned: false
homepage: false
seo:
  title: "Keycloak User Federation SPI 自定义实现：对接企业用户系统"
  description: "通过 Keycloak SPI 实现自定义用户联合，将企业已有的 LDAP、AD 或自有用户系统接入 Keycloak 统一认证。"
  canonical: ""
  noindex: false
---

企业引入 Keycloak 作为统一认证平台时，通常面临已有用户系统（LDAP、AD、自建用户中心）的对接问题。Keycloak 内置了 LDAP/AD Federation Provider，但对于非标准用户存储（如 REST API 用户中心、自研数据库用户表），需要实现自定义 `UserStorageProvider`。

## SPI 核心接口

Keycloak SPI 相关接口定义在 `org.keycloak.storage` 包下，核心接口如下：

| 接口 | 职责 |
|---|---|
| `UserStorageProviderFactory` | 创建 Provider 实例的工厂 |
| `UserStorageProvider` | 基础 Provider 接口，管理生命周期 |
| `UserLookupProvider` | 按 ID / username / email 查询用户 |
| `UserQueryProvider` | 搜索用户（分页、条件过滤） |
| `CredentialInputValidator` | 验证用户密码等凭据 |
| `CredentialInputUpdater` | 更新用户密码 |

按需实现即可：只读用户仅需 `UserLookupProvider`，如要支持登录需实现 `CredentialInputValidator`。

## 实现步骤

### 1. 添加依赖

```xml
<dependency>
    <groupId>org.keycloak</groupId>
    <artifactId>keycloak-server-spi</artifactId>
    <version>${keycloak.version}</version>
    <scope>provided</scope>
</dependency>
<dependency>
    <groupId>org.keycloak</groupId>
    <artifactId>keycloak-server-spi-private</artifactId>
    <version>${keycloak.version}</version>
    <scope>provided</scope>
</dependency>
<dependency>
    <groupId>org.keycloak</groupId>
    <artifactId>keycloak-services</artifactId>
    <version>${keycloak.version}</version>
    <scope>provided</scope>
</dependency>
```

### 2. 实现 Provider Factory

```java
package com.example.keycloak.federation;

import org.keycloak.component.ComponentModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.storage.UserStorageProviderFactory;

public class CustomUserStorageProviderFactory
        implements UserStorageProviderFactory<CustomUserStorageProvider> {

    public static final String PROVIDER_ID = "custom-user-storage";

    @Override
    public CustomUserStorageProvider create(KeycloakSession session, ComponentModel model) {
        return new CustomUserStorageProvider(session, model);
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getHelpText() {
        return "Custom User Storage Provider for legacy user system";
    }
}
```

### 3. 实现 Provider

只读用户联合的最小实现（支持按 username 登录）：

```java
package com.example.keycloak.federation;

import org.keycloak.component.ComponentModel;
import org.keycloak.credential.CredentialInput;
import org.keycloak.credential.CredentialInputValidator;
import org.keycloak.models.*;
import org.keycloak.storage.StorageId;
import org.keycloak.storage.UserStorageProvider;
import org.keycloak.storage.user.UserLookupProvider;

import java.util.Map;

public class CustomUserStorageProvider
        implements UserStorageProvider, UserLookupProvider, CredentialInputValidator {

    private final KeycloakSession session;
    private final ComponentModel model;
    private final CustomUserService userService; // 你的用户系统客户端

    public CustomUserStorageProvider(KeycloakSession session, ComponentModel model) {
        this.session = session;
        this.model = model;
        this.userService = new CustomUserService(
            model.getConfig().getFirst("apiBaseUrl"),
            model.getConfig().getFirst("apiKey")
        );
    }

    @Override
    public UserModel getUserById(RealmModel realm, String id) {
        String externalId = StorageId.externalId(id);
        CustomUser user = userService.findById(externalId);
        if (user == null) return null;
        return createAdapter(realm, user);
    }

    @Override
    public UserModel getUserByUsername(RealmModel realm, String username) {
        CustomUser user = userService.findByUsername(username);
        if (user == null) return null;
        return createAdapter(realm, user);
    }

    @Override
    public UserModel getUserByEmail(RealmModel realm, String email) {
        CustomUser user = userService.findByEmail(email);
        if (user == null) return null;
        return createAdapter(realm, user);
    }

    @Override
    public boolean supportsCredentialType(String credentialType) {
        return CredentialModel.PASSWORD.equals(credentialType);
    }

    @Override
    public boolean isConfiguredFor(RealmModel realm, UserModel user, String credentialType) {
        return supportsCredentialType(credentialType);
    }

    @Override
    public boolean isValid(RealmModel realm, UserModel user, CredentialInput input) {
        if (!supportsCredentialType(input.getType())) return false;
        return userService.validatePassword(user.getUsername(), input.getChallengeResponse());
    }

    private UserModel createAdapter(RealmModel realm, CustomUser user) {
        return new AbstractUserAdapter(session, realm, model) {
            @Override
            public String getUsername() {
                return user.getUsername();
            }

            @Override
            public String getEmail() {
                return user.getEmail();
            }

            @Override
            public String getFirstName() {
                return user.getFirstName();
            }

            @Override
            public String getLastName() {
                return user.getLastName();
            }
        };
    }

    @Override
    public void close() {
        // 资源清理
    }
}
```

### 4. 注册 SPI

在 `src/main/resources/META-INF/services/` 下创建文件：

`org.keycloak.storage.UserStorageProviderFactory`

```
com.example.keycloak.federation.CustomUserStorageProviderFactory
```

### 5. 部署

将编译好的 JAR 复制到 Keycloak 的 `providers/` 目录，重启 Keycloak。

如需通过 Keycloak Admin Console 配置 Provider 参数（如 API 地址、认证信息），在 Factory 中配置 `ConfigProperty` 列表：

```java
@Override
public List<ProviderConfigProperty> getConfigProperties() {
    List<ProviderConfigProperty> config = new ArrayList<>();
    ProviderConfigProperty apiUrl = new ProviderConfigProperty(
        "apiBaseUrl", "API Base URL",
        "The base URL of the legacy user system API",
        ProviderConfigProperty.STRING_TYPE, ""
    );
    config.add(apiUrl);
    return config;
}
```

## 常见模式

### 用户导入 vs 联合

- **用户联合 (Federation)**：用户信息不存储在 Keycloak 本地，每次查询实时请求外部系统。适合外部系统是权威数据源的场景。
- **用户导入 (Import)**：首次登录时将用户信息从外部系统同步到 Keycloak 本地数据库。实现 `ImportSynchronization` 接口。

可结合使用：首次登录时导入，后续使用本地数据，定期同步变更。

### 缓存策略

对于高频查询的用户，Keycloak 自带 User Cache。可在 Provider 层面控制：

```java
@Override
public int getCachePolicy() {
    return CacheableStorageProvider.CachePolicy.NO_CACHE;
    // 或 CachePolicy.MAXIMUM_CACHE
    // 或自定义过期时间
}
```

## 注意事项

1. **事务隔离**：UserStorageProvider 中不应直接操作 Keycloak 数据库的 JPA Entity，使用 Keycloak Model API 操作。
2. **性能**：`getUserByUsername` 是高频调用路径——确保外部查询有索引，考虑加缓存层。
3. **密码校验**：不要将外部系统的密码同步到 Keycloak——在 `isValid()` 中远程校验即可。
4. **Keycloak 版本兼容**：SPI 接口在不同 Keycloak 大版本间可能有 breaking change，升级前检查。
5. **导入模式注意事项**：如果使用导入模式，用户密码校验发生在 Keycloak 本地，外部系统密码变更后用户将无法登录——需实现同步机制。
