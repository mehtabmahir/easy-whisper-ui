#include "mainwindow.h"
#include <QApplication>
#include <QString>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);

    MainWindow w;
    w.setWindowTitle("Whisper UI");
    w.setWindowIcon(QIcon(":resources/icon.png"));

    QStringList fileArgs;

    if (argc > 1) {
        QStringList fileArgs;
        for (int i = 1; i < argc; ++i) {
            QString arg = argv[i];
            if (!arg.isEmpty())
                fileArgs << arg;
        }

        if (!fileArgs.isEmpty())
            w.fileQueue.enqueueFilesAndStart(fileArgs);
    }

    w.show();
    return a.exec();
}
