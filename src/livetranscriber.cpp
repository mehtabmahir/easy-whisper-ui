#include "LiveTranscriber.h"
#include <QCoreApplication>
#include <QThread>

LiveTranscriber::LiveTranscriber(QObject *parent) : QObject(parent)
{
    proc.setProcessChannelMode(QProcess::MergedChannels);

    connect(&proc, &QProcess::readyRead, this, [this]{
        emit newText(QString::fromLocal8Bit(proc.readAll()).trimmed());
    });
    connect(&proc,
            QOverload<int,QProcess::ExitStatus>::of(&QProcess::finished),
            this, &LiveTranscriber::finished);
}

void LiveTranscriber::start(const QString &model, const QString &lang,
                            bool cpuOnly, int stepMs, int lengthMs)
{
    if (proc.state() != QProcess::NotRunning) return;

    QString exe = QCoreApplication::applicationDirPath() + "/whisper-stream.exe";

    QStringList args{
        "-m", model,
        "-l", lang,
        "--step", QString::number(stepMs),
        "--length", QString::number(lengthMs),
        "-t", QString::number(QThread::idealThreadCount())
    };
    if (cpuOnly) args << "--no-gpu";

    proc.setProgram(exe);
    proc.setArguments(args);
    proc.start();
}

void LiveTranscriber::stop()
{
    if (proc.state() == QProcess::NotRunning) return;
    proc.terminate();
    if (!proc.waitForFinished(1500))
        proc.kill();
}
