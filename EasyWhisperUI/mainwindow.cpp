#include "mainwindow.h"
#include "ui_mainwindow.h"
#include <QFile>
#include <QMessageBox>
// (etc.)

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
    , m_filePath(QString())
{
    ui->setupUi(this);
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::setFileToOpen(const QString &filePath)
{
    m_filePath = filePath;

    // If filePath is not empty, open or process the file here
    if (!m_filePath.isEmpty()) {
        // For example, try to open the file:
        QFile file(m_filePath);
        if (file.open(QIODevice::ReadOnly)) {
            // Do something with the file
            QByteArray contents = file.readAll();
            // ...
        } else {
            QMessageBox::warning(this, "Error", "Could not open file: " + file.errorString());
        }
    }
}
