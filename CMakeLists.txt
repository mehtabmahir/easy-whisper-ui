cmake_minimum_required(VERSION 3.16)

project(EasyWhisperUI VERSION 0.1 LANGUAGES CXX)

# ─── Qt & C++ settings ───────────────────────────────────────────
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(QT NAMES Qt6 Qt5 REQUIRED COMPONENTS Widgets)
find_package(Qt${QT_VERSION_MAJOR} REQUIRED COMPONENTS Widgets)

# ─── Source files ────────────────────────────────────────────────
set(PROJECT_SOURCES
    src/main.cpp
    src/mainwindow.cpp
    src/mainwindow.h
    src/mainwindow.ui
    resources/icon.rc
)

# ─── Target definition ───────────────────────────────────────────
if (${QT_VERSION_MAJOR} GREATER_EQUAL 6)
    qt_add_executable(EasyWhisperUI
        MANUAL_FINALIZATION
        ${PROJECT_SOURCES}
        resources/resources.qrc
        src/settings.h  src/settings.cpp
        src/windowhelper.h  src/windowhelper.cpp
        src/filequeue.h  src/filequeue.cpp
        src/transcriptionpipeline.h  src/transcriptionpipeline.cpp
    )
else()
    if (ANDROID)
        add_library(EasyWhisperUI SHARED ${PROJECT_SOURCES})
    else()
        add_executable(EasyWhisperUI ${PROJECT_SOURCES})
    endif()
endif()

target_link_libraries(EasyWhisperUI PRIVATE Qt${QT_VERSION_MAJOR}::Widgets)

# ─── Post-build packaging (WinDeployQt + Inno Setup) ─────────────
find_program(WINDEPLOYQT_EXECUTABLE windeployqt REQUIRED)

add_custom_command(TARGET EasyWhisperUI POST_BUILD
    # Create staging folder
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/build/Final"

    # Copy the freshly built EXE
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "$<TARGET_FILE:EasyWhisperUI>"
            "${CMAKE_SOURCE_DIR}/build/Final/EasyWhisperUI.exe"

    # Copy the build launcher (now in src/)
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/src/build.bat"
            "${CMAKE_SOURCE_DIR}/build/Final/build.bat"

    # Run WinDeployQt
    COMMAND ${WINDEPLOYQT_EXECUTABLE}
            --no-opengl-sw
            --no-opengl
            --no-quick
            --no-translations
            --no-system-d3d-compiler
            --no-svg
            --no-network
            "${CMAKE_SOURCE_DIR}/build/Final/EasyWhisperUI.exe"

    # Trim unneeded files
    COMMAND ${CMAKE_COMMAND} -E remove_directory "${CMAKE_SOURCE_DIR}/build/Final/imageformats"
    COMMAND ${CMAKE_COMMAND} -E rm -f "${CMAKE_SOURCE_DIR}/build/Final/dxcompiler.dll"

    # Compile the installer (setup.iss now in src/)
    COMMAND "C:/Program Files (x86)/Inno Setup 6/ISCC.exe"
            "${CMAKE_SOURCE_DIR}/src/setup.iss"

    COMMENT "Compiling Installer with Inno Setup"
)

# ─── macOS bundle meta (kept from original) ──────────────────────
if (${QT_VERSION} VERSION_LESS 6.1.0)
    set(BUNDLE_ID_OPTION MACOSX_BUNDLE_GUI_IDENTIFIER com.example.EasyWhisperUI)
endif()

set_target_properties(EasyWhisperUI PROPERTIES
    ${BUNDLE_ID_OPTION}
    MACOSX_BUNDLE_BUNDLE_VERSION            ${PROJECT_VERSION}
    MACOSX_BUNDLE_SHORT_VERSION_STRING      ${PROJECT_VERSION_MAJOR}.${PROJECT_VERSION_MINOR}
    MACOSX_BUNDLE                           TRUE
    WIN32_EXECUTABLE                        TRUE
)

# ─── Install rules ───────────────────────────────────────────────
include(GNUInstallDirs)
install(TARGETS EasyWhisperUI
        BUNDLE   DESTINATION .
        LIBRARY  DESTINATION ${CMAKE_INSTALL_LIBDIR}
        RUNTIME  DESTINATION ${CMAKE_INSTALL_BINDIR})

# ─── Qt 6 finalization ───────────────────────────────────────────
if (QT_VERSION_MAJOR EQUAL 6)
    qt_finalize_executable(EasyWhisperUI)
endif()
