#include "windowhelper.h"
#include <QPalette>
#include <QMimeData>
#include <QUrl>
#include <Windows.h>
#include "ui_mainwindow.h"

WindowHelper::WindowHelper(QWidget *window, Ui::EasyWhisperUI *ui, QObject *parent)
    : QObject(parent), window(window), ui(ui)
{
}

void WindowHelper::handleBlur()
{
    window->setAttribute(Qt::WA_TranslucentBackground);
    ui->centralwidget->setAttribute(Qt::WA_TranslucentBackground);

    QColor bg = window->palette().color(QPalette::Window);
    bool isDark = bg.lightness() < 128;

    QString widgetBackground = isDark
                                   ? "background-color: rgba(64, 64, 64, 140); color: white;"
                                   : "background-color: rgba(255, 255, 255, 140); color: black;";

    // All the widgets that get the background style:
    ui->openFile->setAttribute(Qt::WA_TranslucentBackground);
    ui->openFile->setStyleSheet(widgetBackground);

    ui->stop->setAttribute(Qt::WA_TranslucentBackground);
    ui->stop->setStyleSheet(widgetBackground);

    ui->clear->setAttribute(Qt::WA_TranslucentBackground);
    ui->clear->setStyleSheet(widgetBackground);

    ui->model->setAttribute(Qt::WA_TranslucentBackground);
    ui->model->setStyleSheet(widgetBackground);

    ui->language->setAttribute(Qt::WA_TranslucentBackground);
    ui->language->setStyleSheet(widgetBackground);

    ui->arguments->setAttribute(Qt::WA_TranslucentBackground);
    ui->arguments->setStyleSheet(widgetBackground);

    ui->console->setAttribute(Qt::WA_TranslucentBackground);
    ui->console->viewport()->setAttribute(Qt::WA_TranslucentBackground);
    ui->console->setStyleSheet(R"(
        QPlainTextEdit {
            background: transparent;
            color: )" + QString(isDark ? "white" : "black") + R"(;
            border: none;
        }
        QScrollBar:vertical {
            background: transparent;
            width: 10px;
            margin: 0;
        }
        QScrollBar::handle:vertical {
            background: rgba(128, 128, 128, 0.4);
            min-height: 20px;
            border-radius: 5px;
        }
        QScrollBar::add-line:vertical,
        QScrollBar::sub-line:vertical {
            height: 0;
        }
        QScrollBar::add-page:vertical,
        QScrollBar::sub-page:vertical {
            background: none;
        }
    )");

    int acrylicColor = isDark
                           ? static_cast<int>(0x44202020)  // 0x44 = ~27% opacity
                           : static_cast<int>(0x44FFFFFF);

    HWND hwnd = reinterpret_cast<HWND>(window->winId());

    struct ACCENTPOLICY {
        int nAccentState;
        int nFlags;
        int nColor;
        int nAnimationId;
    };

    struct WINCOMPATTRDATA {
        int nAttribute;
        PVOID pData;
        ULONG ulDataSize;
    };

    ACCENTPOLICY policy = { 4 /* ACCENT_ENABLE_ACRYLICBLURBEHIND */, 2, acrylicColor, 0 };
    WINCOMPATTRDATA data = { 19, &policy, sizeof(policy) };

    using pSetWindowCompositionAttribute = BOOL(WINAPI *)(HWND, WINCOMPATTRDATA*);
    auto user32 = GetModuleHandleA("user32.dll");
    auto setWindowCompositionAttribute = reinterpret_cast<pSetWindowCompositionAttribute>(
        GetProcAddress(user32, "SetWindowCompositionAttribute"));
    if (setWindowCompositionAttribute) {
        setWindowCompositionAttribute(hwnd, &data);
    }
}

void WindowHelper::handlePaletteChange(QEvent *event)
{
    if (event->type() == QEvent::PaletteChange)
        handleBlur();
}

void WindowHelper::handleDragEnter(QDragEnterEvent *event)
{
    if (event->mimeData()->hasUrls())
        event->acceptProposedAction();
}

QStringList WindowHelper::handleDrop(QDropEvent *event)
{
    QStringList files;
    QList<QUrl> urls = event->mimeData()->urls();
    for (const QUrl &url : urls) {
        QString filePath = url.toLocalFile();
        if (!filePath.isEmpty())
            files << filePath;
    }
    return files;
}
