#include "mainwindow.h"
#include <QApplication>
#include <QString>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);

    // If the user invoked this via "Open with", argv[1] is typically the file path
    QString filePath;
    if (argc > 1) {
        filePath = argv[1];  // store the file name
    }

    MainWindow w;
    w.setWindowTitle("Whisper UI");
    w.setWindowIcon(QIcon(":resources/icon.png"));

    w.processAudioFile(filePath); // Pass the file path to MainWindow
    w.show();

    return a.exec();
}
