#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QQueue>
#include "settings.h"
#include "windowhelper.h"

QT_BEGIN_NAMESPACE
namespace Ui {
class EasyWhisperUI;
}
QT_END_NAMESPACE

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget *parent = nullptr);
    ~MainWindow();
    void processAudioFile(const QString &filePath);
    void enqueueFilesAndStart(const QStringList &filePaths);

private slots:
    void onOpenFileClicked();
    void dragEnterEvent(QDragEnterEvent *event) override;
    void dropEvent(QDropEvent *event) override;
    void changeEvent(QEvent *event) override;
    void exitProcesses();
    void startNextInQueue();
    void clearConsole();

private:
    WindowHelper *windowHelper;
    Ui::EasyWhisperUI *ui;
    Settings appSettings;
    QString m_filePath;
    QString txtFlag;
    QString srtFlag;
    QString cpuFlag;
    bool isProcessing = false;
    QQueue<QString> fileQueue;
};
#endif // MAINWINDOW_H
