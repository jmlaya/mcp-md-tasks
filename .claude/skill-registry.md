# 🗂️ MASTER SKILL REGISTRY

Este archivo es el índice centralizado de convenciones técnicas del proyecto. El Agente Leader debe consultarlo para inyectar dinámicamente las reglas necesarias en cada tarea de desarrollo.

<!--
EXAMPLE

---

## 📦 package-development
*   **Path:** `.agents/skills/package-development/SKILL.md`
*   **Scope:** `project-local`
*   **Description:** Desarrollo integral de paquetes Bagisto: estructura, service providers, migraciones, modelos con contratos y proxies, repositorios, rutas, controladores, vistas Blade, traducciones, DataGrids, menús, ACL y configuración administrativa.
*   **Triggers:** `["packages/*/*/composer.json", "packages/*/*/src/Providers/", "packages/*/*/src/Database/Migrations/", "packages/*/*/src/Models/", "packages/*/*/src/Repositories/", "packages/*/*/src/Http/Controllers/", "packages/*/*/src/DataGrids/", "packages/*/*/src/Config/", "bootstrap/providers.php", "composer.json:autoload"]`

---

## 🧪 pest-testing
*   **Path:** `.agents/skills/pest-testing/SKILL.md`
*   **Scope:** `project-local`
*   **Description:** Convenciones para pruebas unitarias, de integración, feature y arquitectura con Pest 3 en Bagisto; cubre assertions, datasets, mocks, factories, depuración de fallos y organización de suites PHP.
*   **Triggers:** `["*Test.php", "tests/", "packages/*/*/tests/", "phpunit.xml", "tests/Pest.php", "composer.json:pestphp/pest", "test", "spec", "TDD", "coverage"]`
-->