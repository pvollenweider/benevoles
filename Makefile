# Bénévoles — tâches de développement.
# Usage : `make` (équivalent à `make help`).

.PHONY: help dev dev-up dev-down dev-logs dev-reset dev-setup db-generate db-migrate db-seed db-studio test lint typecheck install e2e e2e-up e2e-down e2e-setup

DEFAULT_GOAL := help

# ── Aide ─────────────────────────────────────────────────────────────────────

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── Setup initial ─────────────────────────────────────────────────────────────

dev-setup: ## Setup complet : .env, deps, postgres, migrations, seed
	@if [ ! -f .env ]; then \
		echo "→ Copie .env.development.example → .env"; \
		cp .env.development.example .env; \
	fi
	@if ! grep -q '^AUTH_SECRET=".\+"' .env; then \
		SECRET=$$(openssl rand -base64 48 | tr -d '\n='); \
		if [ "$$(uname)" = "Darwin" ]; then \
			sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$$SECRET\"|" .env; \
		else \
			sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$$SECRET\"|" .env; \
		fi; \
		echo "→ AUTH_SECRET généré"; \
	fi
	@$(MAKE) install
	@$(MAKE) db-generate
	@$(MAKE) dev-up
	@echo "→ Attente de PostgreSQL…"
	@until docker exec benevoles_postgres_dev pg_isready -U benevoles >/dev/null 2>&1; do sleep 0.5; done
	@$(MAKE) db-migrate
	@$(MAKE) db-seed
	@echo ""
	@echo "✅ Prêt ! Lance \`make dev\` pour démarrer le serveur."
	@echo "   • App :     http://localhost:3000"
	@echo "   • Admin :   http://localhost:3000/admin"
	@echo "   • Mailpit : http://localhost:8025"

install: ## Installe les dépendances npm
	npm install --legacy-peer-deps

# ── Stack docker ──────────────────────────────────────────────────────────────

dev-up: ## Démarre postgres + mailpit (docker-compose.dev.yml)
	docker compose -f docker-compose.dev.yml up -d

dev-down: ## Stoppe la stack dev
	docker compose -f docker-compose.dev.yml down

dev-logs: ## Suit les logs des services dev
	docker compose -f docker-compose.dev.yml logs -f

dev-reset: ## ⚠ Supprime la DB locale (volume) et redémarre tout (deps + migrations + seed)
	@$(MAKE) install
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d
	@echo "→ Attente de PostgreSQL…"
	@until docker exec benevoles_postgres_dev pg_isready -U benevoles >/dev/null 2>&1; do sleep 0.5; done
	@$(MAKE) db-generate
	@$(MAKE) db-migrate
	@$(MAKE) db-seed

# ── App ───────────────────────────────────────────────────────────────────────

dev: ## Lance le serveur Next.js en dev
	npm run dev

# ── Base de données ──────────────────────────────────────────────────────────
# Prisma 7 (avec prisma.config.ts) ne charge pas .env automatiquement.
# Ces commandes utilisent --env-file pour le faire explicitement.

db-generate: ## Génère le client Prisma (src/generated/prisma)
	node --env-file=.env node_modules/.bin/prisma generate

db-migrate: ## Applique les migrations Prisma
	node --env-file=.env node_modules/.bin/prisma migrate deploy

db-seed: ## Crée le compte admin + données démo
	node --env-file=.env node_modules/.bin/prisma db seed

db-studio: ## Ouvre Prisma Studio (http://localhost:5555)
	node --env-file=.env node_modules/.bin/prisma studio

# ── e2e (Playwright) ──────────────────────────────────────────────────────────
# Stack isolée de dev-up : ports 5433/1026/8026, jamais la DB/mailbox perso.
#   make e2e-up && make e2e-setup && make e2e   # première fois
#   make e2e                                    # relances suivantes (stack déjà up)
#   make e2e-down                                # arrête tout (état perdu, pas de volume)

e2e-up: ## Démarre postgres + mailpit e2e (docker-compose.e2e.yml)
	docker compose -f docker-compose.e2e.yml up -d
	@echo "→ Attente de PostgreSQL (e2e)…"
	@until docker exec benevoles_postgres_e2e pg_isready -U benevoles >/dev/null 2>&1; do sleep 0.5; done

e2e-down: ## Stoppe la stack e2e
	docker compose -f docker-compose.e2e.yml down

e2e-setup: ## Crée .env.e2e si absent, migre + seed la DB e2e
	@if [ ! -f .env.e2e ]; then \
		echo "→ Copie e2e/e2e.env.example → .env.e2e"; \
		cp e2e/e2e.env.example .env.e2e; \
	fi
	@if ! grep -q '^AUTH_SECRET=".\+"' .env.e2e; then \
		SECRET=$$(openssl rand -base64 48 | tr -d '\n='); \
		if [ "$$(uname)" = "Darwin" ]; then \
			sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$$SECRET\"|" .env.e2e; \
		else \
			sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$$SECRET\"|" .env.e2e; \
		fi; \
		echo "→ AUTH_SECRET (e2e) généré"; \
	fi
	node --env-file=.env.e2e node_modules/.bin/prisma generate
	node --env-file=.env.e2e node_modules/.bin/prisma migrate deploy
	node --env-file=.env.e2e node_modules/.bin/prisma db seed
	npx playwright install --with-deps chromium

e2e: ## Lance les tests Playwright (stack e2e déjà up + seedée)
	node --env-file=.env.e2e node_modules/.bin/playwright test

# ── Qualité ──────────────────────────────────────────────────────────────────

test: ## Lance la suite de tests (vitest)
	npm test

lint: ## Lint le code
	npm run lint

typecheck: ## Vérifie les types TypeScript
	npx tsc --noEmit
