cmake_minimum_required(VERSION 3.16)

project(EasyWhisperUI VERSION 0.1 LANGUAGES CXX)

set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(QT NAMES Qt6 Qt5 REQUIRED COMPONENTS Widgets)
find_package(Qt${QT_VERSION_MAJOR} REQUIRED COMPONENTS Widgets)

set(PROJECT_SOURCES
        main.cpp
        mainwindow.cpp
        mainwindow.h
        mainwindow.ui
        icon.rc
        icon.icns
)

# Add Mac icon
if (APPLE)
  set(MACOSX_BUNDLE_ICON_FILE icon.icns)
  set_source_files_properties("${CMAKE_SOURCE_DIR}/icon.icns" PROPERTIES MACOSX_PACKAGE_LOCATION "Resources")
endif()

if(${QT_VERSION_MAJOR} GREATER_EQUAL 6)
    qt_add_executable(EasyWhisperUI
        MANUAL_FINALIZATION
        ${PROJECT_SOURCES}
        resources.qrc
    )
# Define target properties for Android with Qt 6 as:
#    set_property(TARGET EasyWhisperUI APPEND PROPERTY QT_ANDROID_PACKAGE_SOURCE_DIR
#                 ${CMAKE_CURRENT_SOURCE_DIR}/android)
# For more information, see https://doc.qt.io/qt-6/qt-add-executable.html#target-creation
else()
    if(ANDROID)
        add_library(EasyWhisperUI SHARED
            ${PROJECT_SOURCES}
        )
# Define properties for Android with Qt 5 after find_package() calls as:
#    set(ANDROID_PACKAGE_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/android")
    else()
        add_executable(EasyWhisperUI
            ${PROJECT_SOURCES}
        )
    endif()
endif()

target_link_libraries(EasyWhisperUI PRIVATE Qt${QT_VERSION_MAJOR}::Widgets)

if (WIN32)
    find_program(WINDEPLOYQT_EXECUTABLE windeployqt REQUIRED)
endif ()
if (APPLE)
    find_program(MACDEPLOYQT_EXECUTABLE macdeployqt REQUIRED)
endif()

if (WIN32)
add_custom_command(TARGET EasyWhisperUI POST_BUILD
    # Make output folder
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/build/Final"

    # Copy the built .exe to Final/
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "$<TARGET_FILE:EasyWhisperUI>"
            "${CMAKE_SOURCE_DIR}/build/Final/EasyWhisperUI.exe"

    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/build.bat"
        "${CMAKE_SOURCE_DIR}/build/Final/build.bat"

    # Run windeployqt on the copied .exe
    COMMAND ${WINDEPLOYQT_EXECUTABLE}
                --no-opengl-sw                # Don't include software OpenGL fallback
                --no-opengl                   # Skip OpenGL entirely
                --no-quick                    # No QML/Quick files
                --no-translations             # No i18n
                --no-system-d3d-compiler      # Skip optional D3D compiler dependency
                --no-svg                      # Skip SVG module
                --no-network                  # Skip network dlls
            "${CMAKE_SOURCE_DIR}/build/Final/EasyWhisperUI.exe"

    # Delete unnecessary files
    COMMAND ${CMAKE_COMMAND} -E remove_directory "${CMAKE_SOURCE_DIR}/build/Final/imageformats"
    COMMAND ${CMAKE_COMMAND} -E rm -f "${CMAKE_SOURCE_DIR}/build/Final/dxcompiler.dll"

    # Compile the installer with Inno Setup
    COMMENT "Compiling Installer"
    COMMAND "C:/Program Files (x86)/Inno Setup 6/ISCC.exe" "${CMAKE_SOURCE_DIR}/setup.iss"
)
endif()
if (APPLE)
add_custom_target(
    buildOSXApp ALL
    DEPENDS EasyWhisperUI
) 
add_custom_command(TARGET buildOSXApp POST_BUILD
    # Make output folder
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/build/Final"

    COMMAND ${CMAKE_COMMAND} -E copy_directory_if_different
        "${CMAKE_SOURCE_DIR}/build/EasyWhisperUI.app"
        "${CMAKE_SOURCE_DIR}/build/Final/EasyWhisperUI.app"

    # For macOS, you might want to use macdeployqt instead
    COMMAND ${MACDEPLOYQT_EXECUTABLE}
        "${CMAKE_SOURCE_DIR}/build/Final/EasyWhisperUI.app"

    # Run install script
    COMMAND sh "${CMAKE_SOURCE_DIR}/build.sh"
)
endif()


# Qt for iOS sets MACOSX_BUNDLE_GUI_IDENTIFIER automatically since Qt 6.1.
# If you are developing for iOS or macOS you should consider setting an
# explicit, fixed bundle identifier manually though.
if(${QT_VERSION} VERSION_LESS 6.1.0)
  set(BUNDLE_ID_OPTION MACOSX_BUNDLE_GUI_IDENTIFIER com.example.EasyWhisperUI)
endif()
set_target_properties(EasyWhisperUI PROPERTIES
    ${BUNDLE_ID_OPTION}
    MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION}
    MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION_MAJOR}.${PROJECT_VERSION_MINOR}
    MACOSX_BUNDLE TRUE
    WIN32_EXECUTABLE TRUE
)

include(GNUInstallDirs)
install(TARGETS EasyWhisperUI
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

if(QT_VERSION_MAJOR EQUAL 6)
    qt_finalize_executable(EasyWhisperUI)
endif()
