# Raid Game Server API Reference

> Colyseus 0.17.6 기반 권위적(Authoritative) 게임 서버.
> 기본 주소: `ws://localhost:2567` (WebSocket) / `http://localhost:2567` (REST)

---

## 1. REST Endpoints

### GET `/api/game-config`

게임 상수, 아이템 레지스트리, 맵/전투 밸런스 값을 반환한다.
프론트엔드는 이 값을 기준으로 렌더링하여 하드코딩 없이 서버와 동기화할 수 있다.

**인증:** 불필요

**응답 예시:**
```json
{
  "map": {
    "width": 50,
    "height": 50,
    "extraction": { "x": 49, "y": 49 }
  },
  "rules": {
    "tickMs": 1000,
    "maxPlayers": 10,
    "lootBoxCount": 20,
    "detectionRange": 10,
    "defaultHp": 100,
    "lootPerBox": { "min": 1, "max": 3 }
  },
  "combat": {
    "unarmed": { "damage": 5, "accuracy": 60, "range": 2 },
    "hitChance": { "min": 10, "max": 95, "distancePenalty": 5 },
    "damageVariance": 0.2
  },
  "items": {
    "ak47":      { "id": "ak47",      "type": "weapon",     "name": "AK-47",     "stats": { "damage": 25, "accuracy": 70, "range": 5 }, "lootWeight": 10 },
    "pistol":    { "id": "pistol",    "type": "weapon",     "name": "Pistol",    "stats": { "damage": 12, "accuracy": 85, "range": 4 }, "lootWeight": 20 },
    "bandage":   { "id": "bandage",   "type": "consumable", "name": "Bandage",   "stats": { "healAmount": 20 }, "lootWeight": 40 },
    "medkit":    { "id": "medkit",    "type": "consumable", "name": "Medkit",    "stats": { "healAmount": 50 }, "lootWeight": 10 },
    "gold_coin": { "id": "gold_coin", "type": "valuable",   "name": "Gold Coin", "stats": { "value": 100 }, "lootWeight": 30 },
    "diamond":   { "id": "diamond",   "type": "valuable",   "name": "Diamond",   "stats": { "value": 500 }, "lootWeight": 5 }
  }
}
```

---

## 2. Room: `raid`

Colyseus WebSocket 방. `@colyseus/sdk`를 통해 접속한다.

```typescript
import { Client } from "@colyseus/sdk";
const client = new Client("ws://localhost:2567");
const room = await client.joinOrCreate("raid", {
  accessToken: "<supabase-jwt>",
  strategy: { /* Strategy JSON */ },
});
```

### 2-1. Join Options (접속 시 전달)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `accessToken` | `string` | O | Supabase JWT. `sub` claim에서 playerId 추출 |
| `strategy` | `Strategy` | O | 에이전트 전략 JSON (아래 스키마 참조) |

**Strategy JSON 스키마:**
```typescript
{
  name: string,            // 1~64자
  rules: Array<{
    priority: number,      // 0이 최고 우선순위
    conditions: Array<{
      subject:  "hp_percent" | "nearby_enemy_count" | "nearest_enemy_distance"
              | "nearby_loot_count" | "nearest_loot_distance"
              | "inventory_count" | "distance_to_extract" | "tick",
      operator: "lt" | "lte" | "gt" | "gte" | "eq",
      value:    number
    }>,
    action: Action
  }>,
  fallbackAction: Action
}
```

**Action 종류:**

| Action | 설명 |
|--------|------|
| `MOVE_TO_NEAREST_LOOT` | 가장 가까운 루트박스 방향으로 1칸 이동 |
| `MOVE_TO_EXTRACT` | 탈출구 (49,49) 방향으로 1칸 이동 |
| `MOVE_TO_RANDOM` | 랜덤 인접 칸으로 이동 |
| `ATTACK_NEAREST` | 가장 가까운 적 공격 |
| `LOOT` | 현재 위치의 루트박스/시체 아이템 획득 |
| `FLEE` | 가장 가까운 적 반대 방향으로 1칸 이동 |
| `HEAL` | 인벤토리 소모품 사용 (HP 회복) |
| `EXTRACT` | 탈출구 위치에서 탈출 (게임 종료) |

---

### 2-2. State Sync (실시간 상태 동기화)

Colyseus Schema로 자동 동기화되는 상태. `room.state`로 접근한다.

#### `RaidState` (루트)

| 필드 | 타입 | 설명 |
|------|------|------|
| `tick` | `number` | 현재 게임 틱 (1초당 +1) |
| `phase` | `string` | `"waiting"` / `"active"` / `"ended"` |
| `mapWidth` | `number` | 맵 가로 크기 (50) |
| `mapHeight` | `number` | 맵 세로 크기 (50) |
| `agents` | `MapSchema<Agent>` | 접속 에이전트 맵. key = `sessionId` |
| `objects` | `MapSchema<MapObject>` | 맵 오브젝트 맵. key = `id` |

#### `Agent`

| 필드 | 타입 | 설명 |
|------|------|------|
| `sessionId` | `string` | Colyseus 세션 ID |
| `playerId` | `string` | Supabase user UUID |
| `x` | `number` | 현재 X 좌표 (0~49) |
| `y` | `number` | 현재 Y 좌표 (0~49) |
| `hp` | `number` | 현재 체력 |
| `maxHp` | `number` | 최대 체력 (100) |
| `state` | `string` | `"alive"` / `"dead"` / `"extracted"` |
| `currentAction` | `string` | 현재 틱에서 수행 중인 액션 |
| `inventory` | `ArraySchema<InventoryItem>` | 보유 아이템 목록 |

> `strategy`, `pendingCommand`는 서버 전용이며 클라이언트에 동기화되지 않음.

#### `MapObject`

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | `string` | 고유 ID (`loot_0`, `corpse_xxx`, `extraction`) |
| `objectType` | `string` | `"LOOT_BOX"` / `"CORPSE"` / `"EXTRACTION"` |
| `x` | `number` | X 좌표 |
| `y` | `number` | Y 좌표 |
| `items` | `ArraySchema<InventoryItem>` | 포함된 아이템 |

#### `InventoryItem`

| 필드 | 타입 | 설명 |
|------|------|------|
| `itemId` | `string` | 아이템 식별자 (`ak47`, `bandage` 등) |
| `itemType` | `string` | `"weapon"` / `"consumable"` / `"valuable"` |
| `quantity` | `number` | 수량 |

**프론트엔드 사용 예시:**
```typescript
room.state.agents.onAdd((agent, sessionId) => {
  // 새 에이전트 스프라이트 생성
});

room.state.agents.onChange((agent, sessionId) => {
  // 위치/HP/상태 업데이트 반영
});

room.state.objects.onRemove((obj, id) => {
  // 빈 루트박스 제거
});
```

---

### 2-3. Server → Client Messages (서버 → 클라이언트 메시지)

`room.onMessage("TYPE", callback)`으로 수신한다.

#### `RAID_RESULT`

레이드 종료 시 해당 클라이언트에게만 전송. 수신 직후 서버가 `client.leave()`를 호출한다.

```typescript
{
  result: "survived" | "died",
  ticksAlive: number
}
```

#### `ATTACK_EVENT` (broadcast)

공격 발생 시 방의 모든 클라이언트에게 전송.

```typescript
{
  tick: number,                // 발생 틱
  attackerSessionId: string,   // 공격자 세션 ID
  defenderSessionId: string,   // 피격자 세션 ID
  weaponId: string,            // "ak47" | "pistol" | "unarmed"
  hit: boolean,                // 명중 여부
  damage: number,              // 적용 데미지 (miss 시 0)
  defenderHpAfter: number      // 피격 후 남은 HP
}
```

**프론트엔드 활용:** 데미지 팝업, 명중/빗나감 이펙트, 전투 로그

#### `DEATH_EVENT` (broadcast)

에이전트 사망 시 방의 모든 클라이언트에게 전송.

```typescript
{
  tick: number,
  victimSessionId: string,
  killerSessionId: string | null,  // null = 접속 끊김에 의한 사망
  corpseId: string                 // 생성된 시체 MapObject ID
}
```

**프론트엔드 활용:** 킬 피드 UI, 사망 애니메이션 트리거

#### `LOOT_EVENT` (broadcast)

아이템 루팅 시 방의 모든 클라이언트에게 전송.

```typescript
{
  tick: number,
  agentSessionId: string,
  objectId: string,                           // 루팅한 맵 오브젝트 ID
  items: Array<{ itemId: string, quantity: number }>
}
```

**프론트엔드 활용:** 루팅 이펙트, 아이템 획득 알림

#### `HEAL_EVENT` (broadcast)

힐 사용 시 방의 모든 클라이언트에게 전송.

```typescript
{
  tick: number,
  agentSessionId: string,
  itemId: string,        // "bandage" | "medkit"
  healAmount: number,    // 회복량
  hpAfter: number        // 회복 후 HP
}
```

**프론트엔드 활용:** 힐 이펙트, +HP 팝업

#### `EXTRACT_EVENT` (broadcast)

에이전트 탈출 시 방의 모든 클라이언트에게 전송.

```typescript
{
  tick: number,
  agentSessionId: string,
  itemCount: number       // 탈출 시 보유 아이템 총 수량
}
```

**프론트엔드 활용:** 탈출 이펙트, 탈출 알림

---

### 2-4. Client → Server Messages (클라이언트 → 서버 메시지)

`room.send("TYPE", payload)`로 전송한다.

#### `OVERRIDE_COMMAND`

전략을 일시적으로 무시하고 긴급 명령을 수행한다. 다음 틱에서 1회만 적용된다.

```typescript
room.send("OVERRIDE_COMMAND", {
  action: "FLEE" | "HEAL"
});
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `action` | `"FLEE"` \| `"HEAL"` | 허용된 긴급 명령만 가능 |

> `ATTACK_NEAREST` 등 공격 계열 override는 불가 (Zod 검증에서 거부됨).

---

## 3. Game Loop (틱 처리 순서)

매 1초(1000ms)마다 서버에서 아래 순서로 실행:

```
1. tick++
2. 모든 alive 에이전트의 전략 평가 → 결정(ActionResult) 수집
3. 결정 일괄 실행:
   - 이동류: x/y 좌표 갱신 (맵 경계 clamp)
   - ATTACK: CombatResolver → ATTACK_EVENT broadcast
   - LOOT: 아이템 이동 → LOOT_EVENT broadcast
   - HEAL: 소모품 사용 → HEAL_EVENT broadcast
   - EXTRACT: DB 저장 → EXTRACT_EVENT broadcast → RAID_RESULT 전송 → leave()
4. 사망 큐 처리:
   - CORPSE 생성 + 인벤토리 이동
   - DEATH_EVENT broadcast
   - Permadeath (DB 장비 삭제)
   - RAID_RESULT 전송 → leave()
5. alive 에이전트 0명이면 phase="ended" → 방 종료
```

> 모든 결정을 먼저 수집한 뒤 동시 실행하여 처리 순서에 의한 불공정을 방지한다.

---

## 4. Condition Subjects (전략 조건 변수)

| Subject | 설명 | 범위 |
|---------|------|------|
| `hp_percent` | (hp / maxHp) * 100 | 0~100 |
| `nearby_enemy_count` | 감지 범위(10칸) 내 alive 적 수 | 0~9 |
| `nearest_enemy_distance` | 가장 가까운 적까지 Manhattan 거리 | 0~98, Infinity(적 없음) |
| `nearby_loot_count` | 감지 범위 내 비어있지 않은 루트박스 수 | 0~20 |
| `nearest_loot_distance` | 가장 가까운 루트박스까지 거리 | 0~98, Infinity(루트 없음) |
| `inventory_count` | 인벤토리 아이템 총 수량 합계 | 0~N |
| `distance_to_extract` | 탈출구(49,49)까지 Manhattan 거리 | 0~98 |
| `tick` | 현재 게임 틱 | 0~N |

---

## 5. Authentication

1. 클라이언트가 Supabase Auth로 로그인하여 JWT 획득
2. `joinOrCreate("raid", { accessToken: jwt, strategy: ... })` 전달
3. 서버에서 `jsonwebtoken.verify(token, SUPABASE_JWT_SECRET)` → `sub` claim 추출
4. 인증 실패 시 `onAuth`에서 throw → 접속 거부

---

## 6. Permadeath 시스템

- **사망 시:** `player_loadouts`에서 `equipped=true` 아이템 전부 DELETE
- **탈출 시:** 인벤토리 아이템을 `player_loadouts`에 INSERT (다음 레이드에서 사용 가능)
- **접속 끊김:** alive 상태에서 이탈하면 사망 처리 (장비 삭제)
