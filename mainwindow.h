#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>

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

private slots:
    void onOpenFileClicked();
    void dragEnterEvent(QDragEnterEvent *event) override;
    void dropEvent(QDropEvent *event) override;
    void loadSettings();
    void saveSettings();
    void exitProcesses();

private:
    Ui::EasyWhisperUI *ui;
    QString m_filePath;
    QString txtFlag;
    QString srtFlag;
};
#endif // MAINWINDOW_H
