#include "help_renderer.h"
#include "build_info.h"

#include <iostream>
#include <algorithm>
#include <numeric>

#ifdef _WIN32
    #include <io.h>
    #define ISATTY _isatty
    #define FILENO _fileno
#else
    #include <unistd.h>
    #define ISATTY isatty
    #define FILENO fileno
#endif

// ============================================================================
// COMMAND REGISTRY — fuente de verdad de todos los comandos de bloom-host
//
// Para agregar un nuevo comando:
//   1. Agregar un CommandDescriptor en la categoría correspondiente
//   2. Implementar el handler en bloom-host.cpp / cli_parser.h
//   3. Registrar el flag en CLIParser::parse_and_execute()
// ============================================================================

std::vector<CategoryDescriptor> HelpRenderer::build_command_registry() {
    std::vector<CategoryDescriptor> cats;

    // -------------------------------------------------------------------------
    // SYSTEM — Información y diagnóstico del proceso
    // -------------------------------------------------------------------------
    {
        CategoryDescriptor cat;
        cat.name        = "SYSTEM";
        cat.description = "Process information and runtime diagnostics";

        // --version
        {
            CommandDescriptor cmd;
            cmd.name        = "--version";
            cmd.short_flag  = "-v";
            cmd.description = "Display version and build number";
            cmd.usage       = "bloom-host --version";
            cmd.category    = "SYSTEM";
            cat.commands.push_back(cmd);
        }

        // --info
        {
            CommandDescriptor cmd;
            cmd.name        = "--info";
            cmd.short_flag  = "-i";
            cmd.description = "Show system, runtime and configuration details";
            cmd.usage       = "bloom-host --info";
            cmd.category    = "SYSTEM";
            CommandDescriptor::Option json_opt;
            json_opt.flag        = "--json";
            json_opt.description = "Output as JSON (machine-readable)";
            cmd.options.push_back(json_opt);
            cat.commands.push_back(cmd);
        }

        // --health
        {
            CommandDescriptor cmd;
            cmd.name        = "--health";
            cmd.short_flag  = "";
            cmd.description = "Run health checks: platform, STDIO, network stack";
            cmd.usage       = "bloom-host --health";
            cmd.category    = "SYSTEM";
            cat.commands.push_back(cmd);
        }

        // --help
        {
            CommandDescriptor cmd;
            cmd.name        = "--help";
            cmd.short_flag  = "-h";
            cmd.description = "Show this help message";
            cmd.usage       = "bloom-host --help";
            cmd.category    = "SYSTEM";
            cat.commands.push_back(cmd);
        }

        cats.push_back(cat);
    }

    // -------------------------------------------------------------------------
    // LIFECYCLE — Inicialización y gestión de sesión
    // -------------------------------------------------------------------------
    {
        CategoryDescriptor cat;
        cat.name        = "LIFECYCLE";
        cat.description = "Session initialization invoked by Sentinel before Chrome launch";

        // --init
        {
            CommandDescriptor cmd;
            cmd.name        = "--init";
            cmd.short_flag  = "";
            cmd.description = "Pre-initialize log directories and register telemetry";
            cmd.usage       = "bloom-host --init --profile-id <id> --launch-id <id>";
            cmd.category    = "LIFECYCLE";

            CommandDescriptor::Option pid_opt;
            pid_opt.flag        = "--profile-id";
            pid_opt.description = "Profile UUID (required)";
            pid_opt.required    = true;
            cmd.options.push_back(pid_opt);

            CommandDescriptor::Option lid_opt;
            lid_opt.flag        = "--launch-id";
            lid_opt.description = "Launch identifier, e.g. 001_6f1909c9_165232 (required)";
            lid_opt.required    = true;
            cmd.options.push_back(lid_opt);

            CommandDescriptor::Option json_opt;
            json_opt.flag        = "--json";
            json_opt.description = "Suppress all stderr output; emit a single JSON object to stdout. "
                                   "Fields: ok, profile_id, launch_id, log_directory, host_log, extension_log, timestamp";
            json_opt.required    = false;
            cmd.options.push_back(json_opt);

            cat.commands.push_back(cmd);
        }

        cats.push_back(cat);
    }

    // -------------------------------------------------------------------------
    // RUNTIME — Operación normal invocada por Chrome Native Messaging
    // -------------------------------------------------------------------------
    {
        CategoryDescriptor cat;
        cat.name        = "RUNTIME";
        cat.description = "Normal operation — launched automatically by Chrome via registry";

        // Modo NM normal (no es un flag, es el modo por defecto)
        {
            CommandDescriptor cmd;
            cmd.name        = "(default)";
            cmd.short_flag  = "";
            cmd.description = "Native Messaging bridge mode — invoked by Chrome, not manually";
            cmd.usage       = "bloom-host --profile-id <id> --launch-id <id>";
            cmd.category    = "RUNTIME";

            CommandDescriptor::Option pid_opt;
            pid_opt.flag        = "--profile-id";
            pid_opt.description = "Profile UUID passed by Chrome via NM manifest args";
            cmd.options.push_back(pid_opt);

            CommandDescriptor::Option lid_opt;
            lid_opt.flag        = "--launch-id";
            lid_opt.description = "Launch identifier passed by Chrome via NM manifest args";
            cmd.options.push_back(lid_opt);

            cat.commands.push_back(cmd);
        }

        cats.push_back(cat);
    }

    return cats;
}

// ============================================================================
// TTY DETECTION
// ============================================================================

bool HelpRenderer::detect_tty() {
    return ISATTY(FILENO(stdout)) != 0;
}

// ============================================================================
// PUBLIC ENTRY POINTS
// ============================================================================

void HelpRenderer::render() {
    bool tty = detect_tty();
    HelpRenderer r(tty, tty);
    auto cats = build_command_registry();

    r.print_header();
    r.print_usage();
    r.print_global_options();
    r.print_categories_overview(cats);
    for (const auto& cat : cats) {
        r.print_category_detail(cat);
    }
    r.print_footer();

    std::cout << r.buf.str();
    std::cout.flush();
}

void HelpRenderer::render_full() {
    render(); // actualmente idéntico — reservado para filtros futuros
}

// ============================================================================
// HELPERS VISUALES
// ============================================================================

void HelpRenderer::writeln(const std::string& line) {
    buf << line << "\n";
}

std::string HelpRenderer::repeat(const std::string& c, int n) {
    std::string result;
    result.reserve(c.size() * n);
    for (int i = 0; i < n; ++i) result += c;
    return result;
}

std::string HelpRenderer::pad_right(const std::string& text, size_t width) {
    if (text.size() >= width) return text;
    return text + std::string(width - text.size(), ' ');
}

std::string HelpRenderer::center_text(const std::string& text, int width) {
    // strip ANSI para medir longitud visible
    std::string plain;
    bool in_escape = false;
    for (char c : text) {
        if (c == '\033') { in_escape = true; continue; }
        if (in_escape)   { if (c == 'm') in_escape = false; continue; }
        plain += c;
    }
    int len = static_cast<int>(plain.size());
    if (len >= width) return text;
    int pad = (width - len) / 2;
    return std::string(pad, ' ') + text;
}

void HelpRenderer::print_section_header(const std::string& title, const char* color) {
    std::string line = repeat(sym.sep, WIDTH);
    writeln();
    writeln(Colors::apply(Colors::GRAY, line, use_colors));
    writeln(Colors::apply(color, Colors::bold("  " + title, use_colors), use_colors));
    writeln(Colors::apply(Colors::GRAY, line, use_colors));
    writeln();
}

std::string HelpRenderer::create_box(const std::string& title, const char* color) {
    int title_len = static_cast<int>(title.size()) + 4; // "[ TITLE ]"
    int padding   = (WIDTH - title_len) / 2;
    int right_pad = WIDTH - padding - title_len;

    std::string box =
        repeat(sym.heavy_sep, padding)
        + sym.bracket_l + " " + title + " " + sym.bracket_r
        + repeat(sym.heavy_sep, right_pad);

    return Colors::apply(color, box, use_colors);
}

// ============================================================================
// HEADER
// ============================================================================

void HelpRenderer::print_header() {
    writeln();
    writeln(center_text(Colors::bold("BLOOM-HOST", use_colors), WIDTH));
    writeln(center_text(Colors::apply(Colors::DIM, "Synapse Native Messaging Bridge  |  v2.1.0  |  build " + std::to_string(BUILD_NUMBER), use_colors), WIDTH));
    writeln();
}

// ============================================================================
// USAGE
// ============================================================================

void HelpRenderer::print_usage() {
    print_section_header("USAGE", Colors::BRIGHT_CYAN);

    writeln("  " + Colors::bold("bloom-host", use_colors) + " [COMMAND] [OPTIONS]");
    writeln();
    writeln("  " + Colors::dim("Examples:", use_colors));
    writeln("    " + Colors::apply(Colors::GREEN, "bloom-host --version", use_colors)
            + Colors::dim("                # Display version", use_colors));
    writeln("    " + Colors::apply(Colors::GREEN, "bloom-host --info", use_colors)
            + Colors::dim("                   # System information", use_colors));
    writeln("    " + Colors::apply(Colors::GREEN, "bloom-host --health", use_colors)
            + Colors::dim("                 # Run health checks", use_colors));
    writeln("    " + Colors::apply(Colors::GREEN, "bloom-host --init --profile-id <id> --launch-id <id>", use_colors)
            + Colors::dim("         # Pre-init (Sentinel)", use_colors));
    writeln("    " + Colors::apply(Colors::GREEN, "bloom-host --init --json --profile-id <id> --launch-id <id>", use_colors)
            + Colors::dim("  # Pre-init, JSON output only", use_colors));
    writeln();
}

// ============================================================================
// GLOBAL OPTIONS
// ============================================================================

void HelpRenderer::print_global_options() {
    print_section_header("GLOBAL OPTIONS", Colors::BRIGHT_YELLOW);

    struct GlobalOpt { std::string flag; std::string desc; };
    std::vector<GlobalOpt> opts = {
        { "--json",    "Output in JSON format (machine-readable)" },
        { "--help, -h","Show this help message"                   },
    };

    for (const auto& opt : opts) {
        writeln("  " + Colors::apply(Colors::YELLOW, pad_right(opt.flag, 16), use_colors)
                + "  " + Colors::dim(opt.desc, use_colors));
    }
    writeln();

    // Nota sobre --json
    writeln("  " + Colors::apply(Colors::BRIGHT_YELLOW, "NOTE:", use_colors)
            + " --json redirects logs to stderr. For clean output in scripts:");
    writeln("    " + Colors::apply(Colors::CYAN, "PowerShell:", use_colors)
            + "  bloom-host --json --info " + Colors::bold("2>$null", use_colors));
    writeln("    " + Colors::apply(Colors::CYAN, "Bash:", use_colors)
            + "        bloom-host --json --info " + Colors::bold("2>/dev/null", use_colors));
    writeln();
}

// ============================================================================
// CATEGORIES OVERVIEW
// ============================================================================

void HelpRenderer::print_categories_overview(const std::vector<CategoryDescriptor>& cats) {
    print_section_header("COMMAND CATEGORIES", Colors::BRIGHT_MAG);

    // Ancho máximo del nombre de categoría para alinear columnas
    size_t max_name = 0;
    for (const auto& cat : cats)
        max_name = std::max(max_name, cat.name.size());

    int total_cmds = 0;
    for (const auto& cat : cats) {
        int count = static_cast<int>(cat.commands.size());
        total_cmds += count;

        std::string count_str = std::to_string(count) + " cmd" + (count != 1 ? "s" : "");

        writeln("  "
            + Colors::apply(Colors::MAGENTA, pad_right(cat.name, max_name + 2), use_colors)
            + "  "
            + Colors::dim(pad_right(cat.description, 52), use_colors)
            + "  "
            + Colors::apply(Colors::BRIGHT_CYAN, count_str, use_colors));
    }

    writeln();
    writeln("  " + Colors::apply(Colors::GRAY, repeat(sym.sep, max_name + 60), use_colors)
            + "  " + Colors::bold("Total: " + std::to_string(total_cmds) + " commands", use_colors));
    writeln();
}

// ============================================================================
// CATEGORY DETAIL
// ============================================================================

void HelpRenderer::print_category_detail(const CategoryDescriptor& cat) {
    writeln();
    writeln(create_box(cat.name, Colors::BRIGHT_CYAN));
    writeln();
    writeln("  " + Colors::dim(cat.description, use_colors));
    writeln();

    for (const auto& cmd : cat.commands) {
        // Nombre del comando en GOLD
        std::string name_str = cmd.name;
        if (!cmd.short_flag.empty())
            name_str += ", " + cmd.short_flag;

        writeln("  " + Colors::apply(Colors::BRIGHT_GREEN, sym.bullet, use_colors)
                + Colors::bold(Colors::apply(Colors::GOLD, name_str, use_colors), use_colors));

        // Descripción
        writeln("    " + Colors::dim(cmd.description, use_colors));
        writeln();

        // Usage
        writeln("    " + Colors::dim("Usage:", use_colors)
                + " " + Colors::apply(Colors::GREEN, cmd.usage, use_colors));
        writeln();

        // Options / Arguments del comando
        if (!cmd.options.empty()) {
            writeln("    " + Colors::bold(Colors::apply(Colors::BRIGHT_CYAN,
                sym.box + " Options:", use_colors), use_colors));
            for (const auto& opt : cmd.options) {
                std::string req = opt.required
                    ? Colors::apply(Colors::YELLOW, " [required]", use_colors)
                    : Colors::dim(" [optional]", use_colors);
                writeln("      " + Colors::apply(Colors::CYAN, pad_right(opt.flag, 20), use_colors)
                        + "  " + Colors::dim(opt.description, use_colors)
                        + req);
            }
            writeln();
        }
    }
}

// ============================================================================
// FOOTER
// ============================================================================

void HelpRenderer::print_footer() {
    writeln();
    writeln(Colors::apply(Colors::GRAY, repeat(sym.sep, WIDTH), use_colors));
    writeln();
    writeln(center_text(
        Colors::dim("bloom-host is part of the Bloom ecosystem", use_colors), WIDTH));
    writeln(center_text(
        Colors::dim("Related: brain  sentinel  nucleus  cortex", use_colors), WIDTH));
    writeln(center_text(
        Colors::dim("Use 'bloom-host <command> --help' is not supported — all help is here.", use_colors), WIDTH));
    writeln();
}
