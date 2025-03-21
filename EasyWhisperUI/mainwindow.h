#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>

QT_BEGIN_NAMESPACE
namespace Ui {
class MainWindow;
}
QT_END_NAMESPACE

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget *parent = nullptr);
    ~MainWindow();
    // Add a method to store the file path passed from main.cpp
    void setFileToOpen(const QString &filePath);

private:
    Ui::MainWindow *ui;
    // Store the file path for later use
    QString m_filePath;
};
#endif // MAINWINDOW_H
