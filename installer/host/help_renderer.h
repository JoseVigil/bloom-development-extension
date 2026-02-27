#pragma once

/**
 * @brief Help renderer para bloom-host
 *
 * Sistema de ayuda visual con soporte ANSI colors, categorías de comandos,
 * y output limpio cuando stdout está redirigido (no-TTY).
 *
 * Inspirado en el help renderer de Brain (Python/Rich) y Nucleus (Go/Cobra).
 * Implementación self-contained en C++ puro, sin dependencias externas.
 *
 * Categorías:
 *   SYSTEM    — Información y diagnóstico del proceso
 *   LIFECYCLE — Inicialización y gestión de sesión
 *   RUNTIME   — Operación normal (Native Messaging, argumentos de Chrome)
 */

#include <string>
#include <vector>
#include <iostream>
#include <sstream>

// ============================================================================
// ANSI COLOR CODES
// ============================================================================

namespace Colors {
    // Control
    constexpr const char* RESET         = "\033[0m";
    constexpr const char* BOLD          = "\033[1m";
    constexpr const char* DIM           = "\033[2m";

    // Palette — espejado del Go renderer
    constexpr const char* CYAN          = "\033[36m";
    constexpr const char* BRIGHT_CYAN   = "\033[96m";
    constexpr const char* GREEN         = "\033[32m";
    constexpr const char* BRIGHT_GREEN  = "\033[92m";
    constexpr const char* YELLOW        = "\033[33m";
    constexpr const char* BRIGHT_YELLOW = "\033[93m";
    constexpr const char* MAGENTA       = "\033[35m";
    constexpr const char* BRIGHT_MAG    = "\033[95m";
    constexpr const char* BLUE          = "\033[34m";
    constexpr const char* BRIGHT_BLUE   = "\033[94m";
    constexpr const char* WHITE         = "\033[97m";
    constexpr const char* GRAY          = "\033[90m";
    constexpr const char* GOLD          = "\033[33m";  // yellow ≈ gold en terminales

    // Aplica color solo si colors_enabled == true
    inline std::string apply(const char* color, const std::string& text, bool enabled) {
        if (!enabled) return text;
        return std::string(color) + text + RESET;
    }

    inline std::string bold(const std::string& text, bool enabled) {
        return apply(BOLD, text, enabled);
    }

    inline std::string dim(const std::string& text, bool enabled) {
        return apply(DIM, text, enabled);
    }
}

// ============================================================================
// SYMBOLS — Unicode en TTY, ASCII en redirección
// ============================================================================

struct Symbols {
    std::string arrow;      // → / ->
    std::string bullet;     // ▸ / >
    std::string item;       // • / *
    std::string sep;        // ─ / -
    std::string heavy_sep;  // ━ / =
    std::string box;        // ▪ / *
    std::string checkmark;  // ✓ / OK
    std::string cross;      // ✗ / X
    std::string bracket_l;  // ┫ / [
    std::string bracket_r;  // ┣ / ]

    explicit Symbols(bool unicode) {
        if (unicode) {
            arrow      = "\u2192";  // →
            bullet     = "\u25b8 "; // ▸
            item       = "\u2022";  // •
            sep        = "\u2500";  // ─
            heavy_sep  = "\u2501";  // ━
            box        = "\u25aa";  // ▪
            checkmark  = "\u2713";  // ✓
            cross      = "\u2717";  // ✗
            bracket_l  = "\u252b";  // ┫
            bracket_r  = "\u2523";  // ┣
        } else {
            arrow      = "->";
            bullet     = "> ";
            item       = "*";
            sep        = "-";
            heavy_sep  = "=";
            box        = "*";
            checkmark  = "OK";
            cross      = "X";
            bracket_l  = "[";
            bracket_r  = "]";
        }
    }
};

// ============================================================================
// COMMAND DESCRIPTOR — metadata de un comando registrado
// ============================================================================

struct CommandDescriptor {
    std::string name;           // e.g. "--version"
    std::string short_flag;     // e.g. "-v"   (vacío si no aplica)
    std::string description;    // Una línea
    std::string usage;          // bloom-host --version
    std::string category;       // "SYSTEM" | "LIFECYCLE" | "RUNTIME"

    struct Option {
        std::string flag;
        std::string short_flag;
        std::string description;
        bool required = false;
    };
    std::vector<Option> options;  // flags adicionales del comando
};

// ============================================================================
// CATEGORY DESCRIPTOR
// ============================================================================

struct CategoryDescriptor {
    std::string name;
    std::string description;
    std::vector<CommandDescriptor> commands;
};

// ============================================================================
// HELP RENDERER
// ============================================================================

class HelpRenderer {
public:
    static constexpr int WIDTH = 100;

    /**
     * @brief Renderiza el help completo a stdout.
     * Detecta automáticamente si stdout es TTY para habilitar colores y Unicode.
     */
    static void render();

    /**
     * @brief Renderiza solo las categorías y sus comandos (--help --full equivalente).
     * Actualmente render() ya incluye todo — reservado para extensión futura.
     */
    static void render_full();

private:
    bool use_colors;
    bool use_unicode;
    Symbols sym;
    std::ostringstream buf;

    explicit HelpRenderer(bool colors, bool unicode)
        : use_colors(colors), use_unicode(unicode), sym(unicode) {}

    static bool detect_tty();

    // Secciones
    void print_header();
    void print_usage();
    void print_global_options();
    void print_categories_overview(const std::vector<CategoryDescriptor>& cats);
    void print_category_detail(const CategoryDescriptor& cat);
    void print_footer();

    // Helpers visuales
    void print_section_header(const std::string& title, const char* color);
    std::string create_box(const std::string& title, const char* color);
    std::string pad_right(const std::string& text, size_t width);
    std::string center_text(const std::string& text, int width);
    std::string repeat(const std::string& c, int n);
    void writeln(const std::string& line = "");

    // Datos de comandos
    static std::vector<CategoryDescriptor> build_command_registry();
};
